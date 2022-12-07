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
  // Format for Google Accounts
  {
    address: 'calendar-id1@company.com',
    provider: 'google',
    obfuscateAsDestination: false,
    obfuscateAsOrigin: false,
  },
  // Format for Microsoft Accounts
  {
    address: 'calendar-id2@company.com',
    provider: 'microsoft',
    clientSecret: 'from_azure_setup_process',
    clientId: 'from_azure_setup_process',
    tenantId: 'from_azure_setup_process',
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

const VERSION = '0.2.1';
const MERGE_PREFIX = '🔄 ';
const DESC_NOT_COPIED_MSG = '(description not copied)'
const SUMMARY_NOT_COPIED_MSG = '(summary not copied)'
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

function ShowAuthorizationURLs() {
  CALENDARS_TO_MERGE.forEach((calendarObj) => {
    if (calendarObj.provider === 'microsoft') {
      var azureService = getAzureService_(calendarObj);
      var authorizationUrl = azureService.getAuthorizationUrl();
      if (!azureService.hasAccess()) {
        console.log('Open this URL in another tab: ' + authorizationUrl);
      } else {
        console.log('It looks like ' + calendarObj.address + ' is already setup, but here is the URL: ' + authorizationUrl);
      }
    }
  });
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

function IsOnObfuscateList(eventSummary) {
  for (const currRe of OBFUSCATE_LIST_REGEXES) {
    const isMatch = new RegExp(currRe).test(eventSummary)
    if (isMatch) {
      log.info(`Obfuscating event "${eventSummary}" that matches regex "${currRe}"`)
      return true
    }
  }
  return false
}

function GetMergeSummary(eventSummary) {
  return `${MERGE_PREFIX}${eventSummary}`;
}

function IsMergeSummary(eventSummary) {
  return (eventSummary || '').startsWith(MERGE_PREFIX);
}

function GetRealStart(event) {
  // Convert all date-times to UTC for comparisons
  return new Date(event.start.dateTime).toUTCString();
}

function DateObjectToItems(dateObject) {
  return Object.keys(dateObject).reduce((items, day) => items.concat(dateObject[day]), [])
}

function ExistsInOrigin(origin, destination, mergedEvent) {
  const realStart = GetRealStart(mergedEvent);
  return !!origin.events.primary[realStart]
    ?.some(originEvent => {
      // If the destination is obfuscated, we'll just be able to tell there's an event at the same time
      return destination.obfuscateTo || (
        mergedEvent.summary === GetMergeSummary(originEvent.summary) &&
        mergedEvent.location === originEvent.location &&
        AttendeeSelfStatusMatches(originEvent, mergedEvent)
      );
    })
}

function ExistsInDestination(destination, originEvent) {
  const realStart = GetRealStart(originEvent);
  return !!destination.events.merged[realStart]
    ?.some(mergedEvent => {
      const checkSummary = destination.obfuscateTo ? SUMMARY_NOT_COPIED_MSG : originEvent.summary;
      const checkLocation = destination.obfuscateTo ? LOC_NOT_COPIED_MSG : originEvent.location;
      const checkDesc = destination.obfuscateTo || !INCLUDE_DESC() ? DESC_NOT_COPIED_MSG : originEvent.description;
      return mergedEvent.summary === GetMergeSummary(checkSummary) &&
        mergedEvent.location === checkLocation &&
        mergedEvent.description === checkDesc &&
        AttendeeSelfStatusMatches(originEvent, mergedEvent)
    })
}

function NeedsObfuscation(destination, event) {
  const shouldObfuscate = destination.obfuscateTo || IsOnObfuscateList(event.summary);
  // If the event should be obfuscated, but isn't...
  return shouldObfuscate && (
    event.location !== LOC_NOT_COPIED_MSG ||
    event.description !== DESC_NOT_COPIED_MSG ||
    event.summary !== GetMergeSummary(SUMMARY_NOT_COPIED_MSG)
  );
}

function AttendeeSelfStatusMatches(originEvent, mergedEvent) {
  if (!COPY_SELF_ATTENDANCE_STATUS()) return true;
  const originStatus = originEvent.attendees?.find(a => a.self === true)?.responseStatus
  const mergedStatus = mergedEvent.attendees?.find(a => a.self === true)?.responseStatus
  const matches = originStatus === mergedStatus
  if(!matches) log.debug(`DIFF FOUND IN ATTENDEE STATUS: originStatus: ${originStatus} ; mergedStatus: ${mergedStatus}`)
  return matches;
}

function GetAttendeeSelf(originEvent, address) {
  if (!COPY_SELF_ATTENDANCE_STATUS()) return [];
  const selfAttendee = originEvent.attendees?.find(a => a.self === true);
  if (typeof selfAttendee === 'undefined') return []
  selfAttendee.email = address;
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

      if (IsMergeSummary(event.summary)) {
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
        eventDateTime.push(event)
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
  CALENDARS_TO_MERGE.forEach((calendarObj) => {
    let cal;
    if (calendarObj.provider === 'google') {
      cal = new GoogleCalendar(calendarObj)
    } else if (calendarObj.provider === 'microsoft') {
      cal = new MicrosoftCalendar(calendarObj);
    }
    cal.retrieve(startTime, endTime);
    calendars.push(cal);
  });

  return calendars;
}

function MergeCalendars (calendars) {
  calendars.forEach(cal => {
    // Now that we have all events for all calendars, ensure each calendar's
    // primary events are merged to others
    DateObjectToItems(cal.events.primary).forEach(originEvent => {
      calendars
        // Don't send to the current calendar
        .filter(destination => destination.address !== cal.address)
        .forEach(destination => {
          if (!ExistsInDestination(destination, originEvent)) {
            const added = destination.addCreateCall(originEvent);
            log.debug(`Pre-event update body for destination:  ${destination.address} :: ${JSON.stringify(added)}`);
          }
        });
    });
    // Also make sure that all of our merged appointments still exist in some
    // other calendar's primary list
    DateObjectToItems(cal.events.merged).forEach(mergedEvent => {
      const primaryFound = calendars
        .some(origin => origin.address !== cal.address &&
            ExistsInOrigin(origin, cal, mergedEvent));
      if (!primaryFound || mergedEvent.isDuplicate || NeedsObfuscation(cal, mergedEvent)) {
        cal.addDeleteCall(mergedEvent)
      }
    });
  });

  calendars.forEach(cal => {
    if (!cal.apiCalls.length) {
      log.info(`No events to modify for ${cal.address}.`);
      return
    }
    if (!DEBUG_ONLY) {
      const result = cal.executeCalls();
      if (!result.getResponseCode || result.getResponseCode() !== 200) {
        log.info(result)
      } else {
        log.debug('RESULT: ', result.toString(), '; ', result.getResponseCode() )
        log.info(`${cal.apiCalls.length} events modified for ${cal.address}:`);
      }
    } else {
      log.debug(`${cal.apiCalls.length} events would have been modified for ${cal.address}:`);
    }
    const loggable = cal.apiCalls
      .map(({method, endpoint, loggableSummary}) => ({method, endpoint, loggableSummary}))
    log.info(`Requests for ${cal.address}`, JSON.stringify(loggable, null, 2));
  });
}

// Based on https://github.com/googleworkspace/apps-script-oauth2
function getAzureService_ (calendarObj) {
  // Create a new service with the given name. The name will be used when
  // persisting the authorized token, so ensure it is unique within the
  // scope of the property store.
  return OAuth2.createService('azure')

  // Set the endpoint URLs, which are the same for all Google services.
    .setAuthorizationBaseUrl('https://login.microsoftonline.com/' + calendarObj.tenantId + '/oauth2/v2.0/authorize')
    .setTokenUrl('https://login.microsoftonline.com/' + calendarObj.tenantId + '/oauth2/v2.0/token')

  // Set the client ID and secret, from the Google Developers Console.
    .setClientId(calendarObj.clientId)
    .setClientSecret(calendarObj.clientSecret)

  // Set the name of the callback function in the script referenced
  // above that should be invoked to complete the OAuth flow.
    .setCallbackFunction('authCallback')

  // Set the property store where authorized tokens should be persisted.
    .setPropertyStore(PropertiesService.getUserProperties())

  // Set the scopes to request (space-separated for Google services).
    .setScope('Calendars.ReadWrite openid Presence.Read.All profile User.Read email')

  // Below are Google-specific OAuth2 parameters.

  // Sets the login hint, which will prevent the account chooser screen
  // from being shown to users logged in with multiple accounts.
    .setParam('login_hint', calendarObj.address)

  // Requests offline access.
    .setParam('access_type', 'offline')

  // Consent prompt is required to ensure a refresh token is always
  // returned when requesting offline access.
    .setParam('prompt', 'consent');
}

function authCallback(request) {
  let result = [];
  CALENDARS_TO_MERGE.forEach((calendarObj) => {
    if (calendarObj.provider === 'microsoft') {
      var azureService = getAzureService_(calendarObj);
      var isAuthorized = azureService.handleCallback(request);
      if (isAuthorized) {
        result.push(calendarObj.address + " is setup!")
      } else {
        result.push(calendarObj.address + " is not setup")
      }
    }
  });
  return HtmlService.createHtmlOutput(result.join('<br/>') + ' You can close this tab');
}

class MicrosoftCalendar {
  constructor(obj) {
    this.address = obj.address;
    this.obfuscateTo = obj.obfuscateAsDestination;
    this.obfuscateFrom = obj.obfuscateAsOrigin;
    this.events;
    this.apiCalls = [];
    const azureService = getAzureService_(obj);
    this.token = azureService.getAccessToken();
  }

  retrieve(startTime, endTime) {
    const items = [];
    let nextPage = 'https://graph.microsoft.com/v1.0/me/calendarview'
      + `?startdatetime=${startTime.toISOString()}`
      + `&enddatetime=${endTime.toISOString()}`;
    do {
      const response = UrlFetchApp.fetch(nextPage, {
        headers: {
          'Authorization': 'Bearer ' + this.token,
        }
      });
      const payload = JSON.parse(response.getContentText());
      items.push(...payload.value.map(event => this.parseEvent(event)));
      nextPage = payload["@odata.nextLink"];
    } while(nextPage);
    log.info(`Found ${items.length} items for ${this.address}`)
    this.events = SortEvents(items);
  }

  parseEvent(event) {
    const shouldObfuscate = this.obfuscateFrom || IsOnObfuscateList(event.subject);
    return {
      id: event.id,
      start: {
        dateTime: event.start.dateTime + 'Z',
      },
      end: event.end,
      description: shouldObfuscate || !INCLUDE_DESC() ? DESC_NOT_COPIED_MSG : event.body.content,
      location: shouldObfuscate ? LOC_NOT_COPIED_MSG : event.location.displayName,
      summary: shouldObfuscate ? SUMMARY_NOT_COPIED_MSG : event.subject,
      transparency: event.showAs === 'free' ? 'transparent' : 'opaque',
      attendees: event.attendees.map(({status, emailAddress}) => ({
        email: emailAddress.address,
        responseStatus: status.response,
        self: emailAddress.address === this.address,
      })),
    };
  }

  addCreateCall(event) {
    const requestBody = {
      subject: GetMergeSummary(this.obfuscateTo ? SUMMARY_NOT_COPIED_MSG : event.summary),
      location: {
        displayName: this.obfuscateTo ? LOC_NOT_COPIED_MSG : event.location,
        locationType: "default",
      },
      reminderMinutesBeforeStart: 0,
      body: {
        contentType: 'text',
        content: this.obfuscateTo || !INCLUDE_DESC() ? DESC_NOT_COPIED_MSG : event,
      },
      start: event.start,
      end: event.end,
      attendees: GetAttendeeSelf(event, this.address),
    };
    this.apiCalls.push({
      method: 'POST',
      endpoint: '/me/events',
      requestBody,
      loggableSummary: requestBody.subject,
    });
    return requestBody;
  }

  addDeleteCall(event) {
    this.apiCalls.push({
      method: 'DELETE',
      endpoint: `/me/events/${event.id}`,
      loggableSummary: event.subject,
    });
  }

  executeCalls() {
    return new MicrosoftBatchRequest({
      requests: this.apiCalls,
      accessToken: this.token,
    });
  }
}

class GoogleCalendar {
  constructor(obj) {
    this.address = obj.address;
    this.obfuscateTo = obj.obfuscateAsDestination;
    this.obfuscateFrom = obj.obfuscateAsOrigin;
    this.events;
    this.apiCalls = [];
    this.baseUrl = 'https://www.googleapis.com/calendar/v3/calendars';
  }

  retrieve(startTime, endTime) {
    const items = [];
    let nextPage;
    const calendarCheck = CalendarApp.getCalendarById(this.address);
    if (!calendarCheck) {
      const msg = `Calendar not found: ${this.address}. Be sure you've shared the`
        + `calendar to this account AND accepted the share!`
      log.info(msg)
      return;
    }

    // Find events
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

      const result = Calendar.Events.list(this.address, options);
      items.push(...result.items.map(event => this.parseEvent(event)));
      nextPage = result.nextPageToken;
    } while(nextPage);
    log.info(`Found ${items.length} items for ${this.address}`)
    this.events = SortEvents(items);
  }

  parseEvent(event) {
    const id = event.getId().replace('@google.com', '');
    const shouldObfuscate = this.obfuscateFrom || IsOnObfuscateList(event.summary);
    return {
      id,
      start: event.start,
      end: event.end,
      description: shouldObfuscate || !INCLUDE_DESC() ? DESC_NOT_COPIED_MSG : event.description,
      location: shouldObfuscate ? LOC_NOT_COPIED_MSG : event.location,
      summary: shouldObfuscate ? SUMMARY_NOT_COPIED_MSG : event.summary,
      transparency: event.transparency,
      attendees: event.attendees,
    };
  }

  addCreateCall(event) {
    const requestBody = {
      summary: GetMergeSummary(this.obfuscateTo ? SUMMARY_NOT_COPIED_MSG : event.summary),
      location: this.obfuscateTo ? LOC_NOT_COPIED_MSG : event.location,
      reminders: {
        useDefault: false,
        overrides: [], // No reminders
      },
      description: this.obfuscateTo || !INCLUDE_DESC() ? DESC_NOT_COPIED_MSG : event,
      start: event.start,
      end: event.end,
      attendees: GetAttendeeSelf(event, this.address),
    };

    this.apiCalls.push({
      method: 'POST',
      endpoint: `${this.baseUrl}/${this.address}/events`,
      requestBody,
      loggableSummary: requestBody.summary,
    });
    return requestBody;
  }

  addDeleteCall(event) {
    this.apiCalls.push({
      method: 'DELETE',
      endpoint: `${this.baseUrl}/${this.address}/events/${event.id}`,
      loggableSummary: event.summary,
    });
  }

  executeCalls() {
    return new BatchRequest({
      batchPath: 'batch/calendar/v3',
      requests: this.apiCalls,
    });
  }
}


if (typeof module !== 'undefined') {
  module.exports = {
    getAzureService_,
    GetStartEndDates,
    ExistsInOrigin,
    ExistsInDestination,
    MERGE_PREFIX,
    DESC_NOT_COPIED_MSG,
    SortEvents,
    IGNORE_LIST_REGEXES,
    IsOnIgnoreList,
    IsOnObfuscateList,
    NeedsObfuscation,
    OBFUSCATE_LIST_REGEXES,
    SUMMARY_NOT_COPIED_MSG,
    LOC_NOT_COPIED_MSG,
    SYNC_DAYS_IN_PAST,
    SYNC_DAYS_IN_FUTURE,
    COPY_SELF_ATTENDANCE_STATUS,
    AttendeeSelfStatusMatches,
    GetAttendeeSelf,
  }
}
