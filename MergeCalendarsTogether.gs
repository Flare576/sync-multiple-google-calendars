// Calendars to merge.
//
// Setting "obfuscateAsDestination" to true will cause all merged events on that calendar to have generic
// placeholder text for summary, description, and location.
//   - This use useful if you have a client with whom you don't wish to share details of your appointments
//
// Setting "obfuscateAsOrigin" to true will cause all other calenders to have generic
// placeholder text for summary, description, and location for events originating from that calendar.
//   - This is useful if you have a client from whom you don't want the details of appointments going to others
//
const CALENDARS_TO_MERGE = [
  {
    address: 'calendar-id1@company.com',
    provider: 'google',
    obfuscateAsDestination: false,
    obfuscateAsOrigin: false,
  },
  {
    address: 'calendar-id1@company.com',
    provider: 'google',
    obfuscateAsDestination: false,
    obfuscateAsOrigin: false,
  },
];

// Number of days in the past and future to sync.
const SYNC_DAYS_IN_PAST = 7;
const SYNC_DAYS_IN_FUTURE = 30;
// While set to "true", this script will make ABSOLUTELY NO CHANGES to any Calendar
// Set this to "false" when your happy with the debug output!
const DEBUG_ONLY = true;

const VERBOSE_LOGGING = false;

// Configure event summaries to ignore (don't sync). These values are used with
// RegExp.test() so when just a string literal, they act like a case-sensitive
// "contains" check. If you want more control, use the line start (^) and/or
// line end ($) regex symbols.
const IGNORE_LIST_REGEXES = [
  // 'Contains Match',
  // '^Starts With Match',
  // 'Ends With Match$',
  // '^Some Exact Match$',
  // '^Exact start.*Exact end$', // with anything in the middle
]
// Configure event summaries to obfuscate (sync but with no details). These values
// are used with RegExp.test() so when just a string literal, they act like a
// case-sensitive "contains" check. If you want more control, use the line start
// (^) and/or line end ($) regex symbols.
const OBFUSCATE_LIST_REGEXES = [
  // 'Contains Match',
  // '^Starts With Match',
  // 'Ends With Match$',
  // '^Some Exact Match$',
  // '^Exact start.*Exact end$', // with anything in the middle
]

// should we copy event descriptions?
const USER_INCLUDE_DESC = false;

// should we copy the original attendance status from the primary calendar?
// If true, we'll keep your declined/pending status instead of marking you busy.
const USER_COPY_SELF_ATTENDANCE_STATUS = false;

// ----------------------------------------------------------------------------
// DO NOT TOUCH FROM HERE ON
// ----------------------------------------------------------------------------

const VERSION = '0.2.2';
const ENDPOINT_BASE = 'https://www.googleapis.com/calendar/v3/calendars';
const MERGE_PREFIX = '🔄 ';
const DESC_NOT_COPIED_MSG = '(description not copied)'
const SUMMARY_NOT_COPIED_MSG = 'Busy'
const LOC_NOT_COPIED_MSG = '(location not copied)'

const log = createLogger();

// listed as first function so it's the default to run in the web UI
function MergeCalendarsTogether() {
  const dates = GetStartEndDates();
  var lock = LockService.getScriptLock();
  lock.tryLock(60000);
  const calendars = RetrieveCalendars(dates[0], dates[1]);
  MergeCalendars(calendars);
  lock.releaseLock();
}

function DeleteAllMerged () {
  const dates = GetStartEndDates();
  const calendars = RetrieveCalendars(dates[0], dates[1]);

  // Easiest way to clear out all merged events is to ensure there's no matching Primary events
  calendars.forEach(calendar => {
    calendar.events.primary = [];
  });
  MergeCalendars(calendars);
}

function GetStartEndDates () {
  const SDIP = typeof module !== 'undefined' && typeof module.exports.TEST_SYNC_DAYS_IN_PAST === 'number'
    ? module.exports.TEST_SYNC_DAYS_IN_PAST
    : SYNC_DAYS_IN_PAST
  const SDIF = typeof module !== 'undefined' && typeof module.exports.TEST_SYNC_DAYS_IN_FUTURE === 'number'
    ? module.exports.TEST_SYNC_DAYS_IN_FUTURE
    : SYNC_DAYS_IN_FUTURE

  // Midnight today
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - SDIP);

  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);
  endDate.setDate(endDate.getDate() + SDIF);
  return [startDate, endDate];
}

function createLogger (){
  return {
    info: (...msg)=> { console.log('INFO: ', ...msg) },
    debug: (...msg)=> { if (VERBOSE_LOGGING) console.log('DEBUG:', ...msg)}
  }
}

function INCLUDE_DESC() {
  if (typeof module === 'undefined') {
    return USER_INCLUDE_DESC
  }
  return typeof module.exports.TEST_INCLUDE_DESC === 'boolean'
    ? module.exports.TEST_INCLUDE_DESC
    : USER_INCLUDE_DESC
}

function COPY_SELF_ATTENDANCE_STATUS() {
  if (typeof module === 'undefined') {
    return USER_COPY_SELF_ATTENDANCE_STATUS
  }
  return typeof module.exports.TEST_COPY_SELF_ATTENDANCE_STATUS === 'boolean'
    ? module.exports.TEST_COPY_SELF_ATTENDANCE_STATUS
    : USER_COPY_SELF_ATTENDANCE_STATUS
}

function IsOnIgnoreList(event) {
  for (const currRe of IGNORE_LIST_REGEXES) {
    const isMatch = new RegExp(currRe).test(event.summary)
    if (isMatch) {
      log.info(`Ignoring event "${event.summary}" that matches regex "${currRe}"`)
      return true
    }
  }
  return false
}

function IsOnObfuscateList(event) {
  for (const currRe of OBFUSCATE_LIST_REGEXES) {
    const isMatch = new RegExp(currRe).test(event.summary)
    if (isMatch) {
      log.info(`Obfuscating event "${event.summary}" that matches regex "${currRe}"`)
      return true
    }
  }
  return false
}

function GetMergeSummary(eventSummary) {
  return `${MERGE_PREFIX}${eventSummary}`;
}

function IsMergeSummary(event) {
  return (event.summary || '').startsWith(MERGE_PREFIX);
}

function GetRealStart(event) {
  // Convert all date-times to UTC for comparisons
  return new Date(event.start.dateTime).toUTCString();
}

function DateObjectToItems(dateObject) {
  return Object.keys(dateObject).reduce((items, day) => items.concat(dateObject[day]), [])
}

function ExistsInOrigin(origin, mergedEvent) {
  const realStart = GetRealStart(mergedEvent);
  return !!origin.events.primary[realStart]
    ?.some(originEvent => {
      const summaryToCheck = originEvent.shouldObfuscate ? SUMMARY_NOT_COPIED_MSG : originEvent.summary;
      const locationToCheck = originEvent.shouldObfuscate ? LOC_NOT_COPIED_MSG : originEvent.location;
      const descriptionToCheck = originEvent.shouldObfuscate || !INCLUDE_DESC() ? DESC_NOT_COPIED_MSG : originEvent.description;

      return mergedEvent.summary === GetMergeSummary(summaryToCheck) &&
        mergedEvent.location === locationToCheck &&
        mergedEvent.description === descriptionToCheck &&
        AttendeeSelfStatusMatches(originEvent, mergedEvent)
    })
}

function ExistsInDestination(destination, originEvent) {
  const realStart = GetRealStart(originEvent);
  return !!destination.events.merged[realStart]
    ?.some(mergedEvent => {
      const lookForObfuscated = destination.obfuscateAsDestination || originEvent.shouldObfuscate;
      const summaryToCheck = lookForObfuscated ? SUMMARY_NOT_COPIED_MSG : originEvent.summary;
      const locationToCheck = lookForObfuscated ? LOC_NOT_COPIED_MSG : originEvent.location;
      const descriptionToCheck = lookForObfuscated || !INCLUDE_DESC()  ? DESC_NOT_COPIED_MSG : originEvent.description;

      return mergedEvent.summary === GetMergeSummary(summaryToCheck) &&
        mergedEvent.location === locationToCheck &&
        mergedEvent.description === descriptionToCheck &&
        AttendeeSelfStatusMatches(originEvent, mergedEvent)
    })
}

function AttendeeSelfStatusMatches(originEvent, mergedEvent) {
  if (!COPY_SELF_ATTENDANCE_STATUS()) return true;
  const originStatus = originEvent.attendees?.find(a => a.self === true)?.responseStatus
  const mergedStatus = mergedEvent.attendees?.find(a => a.self === true)?.responseStatus
  const matches = originStatus === mergedStatus
  if(!matches) log.debug(`DIFF FOUND IN ATTENDEE STATUS: originStatus: ${originStatus} ; mergedStatus: ${mergedStatus}`)
  return matches;
}

function GetAttendeeSelf(originEvent, destination) {
  if (!COPY_SELF_ATTENDANCE_STATUS()) return [];
  const selfAttendee = originEvent.attendees?.find(a => a.self === true);
  if (typeof selfAttendee === 'undefined') return []
  selfAttendee.email = destination.address;
  return [selfAttendee];
}

function SortEvents(items) {
    const primary = {};
    const merged = {};

    items.forEach((event) => {
      // Don't copy "free" events.
      if (event.transparency === 'transparent') {
        log.info(`Ignoring transparent event: ${event.summary}`)
        return;
      }
      const realStart = GetRealStart(event);

      if (IsMergeSummary(event)) {
        const eventDateTime = merged[realStart] || [];
        if (eventDateTime.some(e => e.summary === event.summary)) {
          event.isDuplicate = true;
          log.info(`Marking "${event.summary}" as duplicate`)
        }
        eventDateTime.push(event)
        merged[realStart] = eventDateTime;
      } else {
        // only check ignores for the "primary". We need them to still end up in the
        // "merged" so they'll be cleaned up when new ignores are added.
        if (IsOnIgnoreList(event)) {
          return
        }
        const eventDateTime = primary[realStart] || [];
        const [summary, description, location] = (() => {
          if (!IsOnObfuscateList(event)) {
            return [event.summary, event.description, event.location]
          }
          return [SUMMARY_NOT_COPIED_MSG, DESC_NOT_COPIED_MSG, LOC_NOT_COPIED_MSG]
        })()
        eventDateTime.push({
          ...event,
          summary,
          description,
          location,
        })
        primary[realStart] = eventDateTime;
      }
    });

  return {
    primary,
    merged,
  }
}

function RetrieveCalendars(startTime, endTime) {
  const calendars = []
  CALENDARS_TO_MERGE.forEach(calendarObj => {
    const {address} = calendarObj;
    const calendarCheck = CalendarApp.getCalendarById(address);
    if (!calendarCheck) {
      const msg = `Calendar not found: ${address}. Be sure you've shared the`
        + `calendar to this account AND accepted the share!`
      log.info(msg)
      return;
    }

    // Find events
    const items = [];
    let nextPage;
    do {
      let options = {
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      };
      if (nextPage) {
        options.pageToken = nextPage;
      }

      const result = Calendar.Events.list(address, options);
      items.push(...result.items.map(event => ParseEvent(calendarObj, event)))
      nextPage = result.nextPageToken;
    } while(nextPage);
    log.info(`Found ${items.length} items for ${address}`)

    calendars.push({
      ...calendarObj,
      events: SortEvents(items),
    })
  });

  return calendars;
}

/*
 * Ended up needing to be slightly smarter than I would like - has 2 responsibilities:
 * - id should be a string, not a function
 * - If obfuscateAsOrigin is set, or if IsOnObfuscateList, mark event "shouldObfuscate" UNLESS
 *   - Event is Merged Event that was NOT obfuscated
 */
function ParseEvent (calendarObj, event) {
    const id = event.getId().replace('@google.com', '');
    let shouldObfuscate = calendarObj.obfuscateAsOrigin || IsOnObfuscateList(event);
    // Merged events should only be marked as "ShouldObfuscate" if they already are
    if (IsMergeSummary(event)) {
      shouldObfuscate = event.summary === GetMergeSummary(SUMMARY_NOT_COPIED_MSG)
    }
    return {
      id,
      shouldObfuscate,
      start: event.start,
      end: event.end,
      description: event.description,
      location: event.location,
      summary: event.summary,
      transparency: event.transparency,
      attendees: event.attendees,
    };
}

function GenerateCreatePayload (destination, event) {
    const shouldObfuscate = event.shouldObfuscate || destination.obfuscateAsDestination;
    const requestBody = {
      summary: GetMergeSummary(shouldObfuscate ? SUMMARY_NOT_COPIED_MSG : event.summary),
      location: shouldObfuscate ? LOC_NOT_COPIED_MSG : event.location,
      reminders: {
        useDefault: false,
        overrides: [], // No reminders
      },
      description: shouldObfuscate || !INCLUDE_DESC() ? DESC_NOT_COPIED_MSG : event.description,
      start: event.start,
      end: event.end,
      attendees: GetAttendeeSelf(event, destination.address),
    };

    return requestBody;
}

function MergeCalendars (calendars) {
  // One Calender per batch...
  const payloadSets = {};

  calendars.forEach(cal => {
    // Now that we have all events for all calendars, ensure each calendar's
    // primary events are merged to others
    DateObjectToItems(cal.events.primary).forEach(originEvent => {
      calendars
        .filter(destination => destination.address !== cal.address) // Don't send to the current calendar
        .forEach(destination => {
          const calendarRequests = payloadSets[destination.address] || [];
          if (!ExistsInDestination(destination, originEvent)) {
            const body = GenerateCreatePayload(destination, originEvent)
            log.debug(`Pre-event update body for destination:  ${destination.address} :: ${JSON.stringify(body, null, 2)}`)
            calendarRequests.push(JSON.parse(JSON.stringify({
              method: 'POST',
              endpoint: `${ENDPOINT_BASE}/${destination.address}/events`,
              summary: body.summary, // Only used in debugging statements
              requestBody: body,
            })));
          }
          payloadSets[destination.address] = calendarRequests;
        });
    });
    // Also make sure that all of our merged appointments still exist in some
    // other calendar's primary list
    DateObjectToItems(cal.events.merged).forEach(mergedEvent => {
      const primaryFound = calendars
        .some(origin => origin.address !== cal.address && ExistsInOrigin(origin, mergedEvent));
      if (!primaryFound || mergedEvent.isDuplicate) {
        let calendarRequests = payloadSets[cal.address] || [];
        calendarRequests.push({
          method: 'DELETE',
          endpoint: `${ENDPOINT_BASE}/${cal.address}/events/${mergedEvent.id}`,
          summary: mergedEvent.summary, // Only used in debugging statements
        });
        payloadSets[cal.address] = calendarRequests;
      }
    });
  });

  Object.keys(payloadSets).forEach(address => {
    const calendarRequests = payloadSets[address];
    if (!(calendarRequests || []).length) {
      log.info(`No events to modify for ${address}.`);
      return
    }
    if (!DEBUG_ONLY) {
      const result = new BatchRequest({
        batchPath: 'batch/calendar/v3',
        requests: calendarRequests,
      });
      if (!result.getResponseCode || result.getResponseCode() !== 200) {
        log.info(result)
      } else {
        log.debug('RESULT: ', result.toString(), '; ', result.getResponseCode() )
        log.info(`${calendarRequests.length} events modified for ${address}:`);
      }
    } else {
      log.debug(`${calendarRequests.length} events would have been modified for ${address}:`);
    }
    const loggable = calendarRequests
      .map(({method, endpoint, summary}) => ({method, endpoint, summary}))
    log.info(`Requests for ${address}`, JSON.stringify(loggable, null, 2));
  });
}

if (typeof module !== 'undefined') {
  module.exports = {
    GetStartEndDates,
    ExistsInOrigin,
    ExistsInDestination,
    MERGE_PREFIX,
    DESC_NOT_COPIED_MSG,
    SortEvents,
    IGNORE_LIST_REGEXES,
    IsOnIgnoreList,
    IsOnObfuscateList,
    OBFUSCATE_LIST_REGEXES,
    SUMMARY_NOT_COPIED_MSG,
    LOC_NOT_COPIED_MSG,
    SYNC_DAYS_IN_PAST,
    SYNC_DAYS_IN_FUTURE,
    COPY_SELF_ATTENDANCE_STATUS,
    AttendeeSelfStatusMatches,
    GetAttendeeSelf,
    ParseEvent,
    GenerateCreatePayload,
  }
}
