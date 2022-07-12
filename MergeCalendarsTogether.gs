// Calendars to merge.
const CALENDARS_TO_MERGE = [
  'calendar-id1@gmail.com',
  'calendar-id2@gmail.com',
];

// Number of days in the past and future to sync.
const SYNC_DAYS_IN_PAST = 7;
const SYNC_DAYS_IN_FUTURE = 30;
// While set to "true", this script will make ABSOLUTELY NO CHANGES to any Calendar
// Set this to "false" when your happy with the debug output!
const DEBUG_ONLY = true;

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

// ----------------------------------------------------------------------------
// DO NOT TOUCH FROM HERE ON
// ----------------------------------------------------------------------------

const VERSION = '0.1.1';
const ENDPOINT_BASE = 'https://www.googleapis.com/calendar/v3/calendars';
const MERGE_PREFIX = '🔄 ';
const DESC_NOT_COPIED_MSG = '(description not copied)'
const SUMMARY_NOT_COPIED_MSG = '(summary not copied)'
const LOC_NOT_COPIED_MSG = '(location not copied)'
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
    calendar.primary = [];
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

function INCLUDE_DESC() {
  if (typeof module === 'undefined') {
    return USER_INCLUDE_DESC
  }
  return typeof module.exports.TEST_INCLUDE_DESC === 'boolean'
    ? module.exports.TEST_INCLUDE_DESC
    : USER_INCLUDE_DESC
}

function IsOnIgnoreList(event) {
  for (const currRe of IGNORE_LIST_REGEXES) {
    const isMatch = new RegExp(currRe).test(event.summary)
    if (isMatch) {
      console.log(`Ignoring event "${event.summary}" that matches regex "${currRe}"`)
      return true
    }
  }
  return false
}

function IsOnObfuscateList(event) {
  for (const currRe of OBFUSCATE_LIST_REGEXES) {
    const isMatch = new RegExp(currRe).test(event.summary)
    if (isMatch) {
      console.log(`Obfuscating event "${event.summary}" that matches regex "${currRe}"`)
      return true
    }
  }
  return false
}

function GetMergeSummary(event) {
  return `${MERGE_PREFIX}${event.summary}`;
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

function IsMergedEvent(mergedEvent, originEvent) {
  return mergedEvent.summary === GetMergeSummary(originEvent) &&
    mergedEvent.transparency === originEvent.transparency &&
    mergedEvent.location === originEvent.location;
}

function ExistsInOrigin(origin, mergedEvent) {
  const realStart = GetRealStart(mergedEvent);
  return !!origin.primary[realStart]
    ?.some(originEvent => {
      return IsMergedEvent(mergedEvent, originEvent)
    })
}

function ExistsInDestination(destination, originEvent) {
  const realStart = GetRealStart(originEvent);
  return !!destination.merged[realStart]
    ?.some(mergedEvent => {
      return IsMergedEvent(mergedEvent, originEvent) &&
        !IsDescWrong(mergedEvent, originEvent) // sorry for the double negative :'(
    })
}

function GetDesc(event) {
  if (!INCLUDE_DESC()) {
    return DESC_NOT_COPIED_MSG
  }
  return event.description
}

function IsDescWrong(event, originEvent) {
  if (INCLUDE_DESC()) {
    if(originEvent){
      return event.description !== GetDesc(originEvent)
    }else{
      return event.description === DESC_NOT_COPIED_MSG
    }
  }
  const shouldNotHaveDescButDoes = event.description !== DESC_NOT_COPIED_MSG
  return shouldNotHaveDescButDoes
}

function SortEvents(calendarId, items) {
    const primary = {};
    const merged = {};

    items.forEach((event) => {
      const realStart = GetRealStart(event);

      if (IsMergeSummary(event)) {
        const eventDateTime = merged[realStart] || [];
        var possibleDuplicate = eventDateTime.filter(e => e.summary === event.summary);
        if (possibleDuplicate.length >= 1) {
          if(possibleDuplicate[0].updated >= event.updated){
            event.isDuplicate = true;
          }
          else{
            possibleDuplicate[0].isDuplicate = true;
          }
          console.log(`Marking "${event.summary}" as duplicate`)
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
    calendarId,
    primary,
    merged,
  }
}

function RetrieveCalendars(startTime, endTime) {
  const calendars = []
  CALENDARS_TO_MERGE.forEach(calendarId => {
    const calendarCheck = CalendarApp.getCalendarById(calendarId);
    if (!calendarCheck) {
      const msg = `Calendar not found: ${calendarId}. Be sure you've shared the`
        + `calendar to this account AND accepted the share!`
      console.log(msg)
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

      const result = Calendar.Events.list(calendarId, options);
      items.push(...result.items)
      nextPage = result.nextPageToken;
    } while(nextPage);
    console.log(`Found ${items.length} items for ${calendarId}`)

    calendars.push(SortEvents(calendarId, items));
  });

  return calendars;
}


function MergeCalendars (calendars) {
  // One Calender per batch...
  const payloadSets = {};

  calendars.forEach(({calendarId, primary, merged}) => {
    // Now that we have all events for all calendars, ensure each calendar's
    // primary events are merged to others
    DateObjectToItems(primary).forEach(originEvent => {
      calendars
        .filter(destination => destination.calendarId !== calendarId) // Don't send to the current calendar
        .forEach(destination => {
          const calendarRequests = payloadSets[destination.calendarId] || [];
          if (!ExistsInDestination(destination, originEvent)) {
            const body = {
              summary: GetMergeSummary(originEvent),
              location: originEvent.location,
              reminders: {
                useDefault: false,
                overrides: [], // No reminders
              },
              description: GetDesc(originEvent),
              start: originEvent.start,
              end: originEvent.end,
              transparency: originEvent.transparency,
            }
            calendarRequests.push({
              method: 'POST',
              endpoint: `${ENDPOINT_BASE}/${destination.calendarId}/events`,
              summary: body.summary, // Only used in debugging statements
              requestBody: body,
            });
          }
          payloadSets[destination.calendarId] = calendarRequests;
        });
    });
    // Also make sure that all of our merged appointments still exist in some
    // other calendar's primary list
    DateObjectToItems(merged).forEach(mergedEvent => {
      const primaryFound = calendars
        .some(origin => origin.calendarId !== calendarId &&
            ExistsInOrigin(origin, mergedEvent));
      if (!primaryFound || mergedEvent.isDuplicate) {
        let calendarRequests = payloadSets[calendarId] || [];
        calendarRequests.push({
          method: 'DELETE',
          endpoint: `${ENDPOINT_BASE}/${calendarId}/events/${mergedEvent.getId()
              .replace('@google.com', '')}`,
          summary: mergedEvent.summary, // Only used in debugging statements
        });
        payloadSets[calendarId] = calendarRequests;
      }
    });
  });

  Object.keys(payloadSets).forEach(calendarId => {
    const calendarRequests = payloadSets[calendarId];
    if (!(calendarRequests || []).length) {
      console.log(`No events to modify for ${calendarId}.`);
      return
    }
    if (!DEBUG_ONLY) {
      const result = new BatchRequest({
        batchPath: 'batch/calendar/v3',
        requests: calendarRequests,
      });
      if (!result.getResponseCode || result.getResponseCode() !== 200) {
        console.log(result)
      }
      console.log(`${calendarRequests.length} events modified for ${calendarId}:`);
    } else {
      console.log(`DEBUG: ${calendarRequests.length} events would have been modified for ${calendarId}:`);
    }
    const loggable = calendarRequests
      .map(({method, endpoint, summary}) => ({method, endpoint, summary}))
    console.log(`Requests for ${calendarId}`, JSON.stringify(loggable, null, 2));
  });
}

if (typeof module !== 'undefined') {
  module.exports = {
    GetStartEndDates,
    ExistsInOrigin,
    ExistsInDestination,
    MERGE_PREFIX,
    DESC_NOT_COPIED_MSG,
    IsDescWrong,
    SortEvents,
    IGNORE_LIST_REGEXES,
    IsOnIgnoreList,
    IsOnObfuscateList,
    OBFUSCATE_LIST_REGEXES,
    SUMMARY_NOT_COPIED_MSG,
    LOC_NOT_COPIED_MSG,
    SYNC_DAYS_IN_PAST,
    SYNC_DAYS_IN_FUTURE,
  }
}
