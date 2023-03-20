// ghetto unit tests: just run it as a script
//   node test.js
//   node --inspect-brk test.js // to debug
const objectUnderTest = require('./MergeCalendarsTogether.gs')

const real_console = console
function mockConsole () {
  const fake_console = fakeConsoleGen()
  console = fake_console
}
function unMockConsole () {
  console = real_console
}

const baseEvent = {
  start: "start",
  end: "end",
  description: "the description",
  location: "a location",
  summary: "the summary",
  transparency: "semi-transparent-i-guess",
}

const baseParseEvent = {
  ...baseEvent,
  getId: () => "anId",
  attendees: "over 9000 people",
}

const baseGenericEvent = {
  ...baseEvent,
  id: 'anId',
  attendees: ["over 9000 people"],
}

const baseCal = {
  address: 'calendar-id1@company.com',
  provider: 'google',
  obfuscateAsDestination: false,
  obfuscateAsOrigin: false,
}

it('should use the right date range', () => {
  const rightStart = new Date()
  const rightEnd = new Date()
  rightStart.setHours(0, 0, 0, 0);
  rightEnd.setHours(0, 0, 0, 0);
  rightStart.setDate(rightStart.getDate() - objectUnderTest.SYNC_DAYS_IN_PAST);
  rightEnd.setDate(rightEnd.getDate() + objectUnderTest.SYNC_DAYS_IN_FUTURE);

  const dates = objectUnderTest.GetStartEndDates();
  return dates[0].valueOf() === rightStart.valueOf() && dates[1].valueOf() === rightEnd.valueOf();
})

it('should use the right date range if modified', () => {
  const newPast = 20
  const newFuture = 99
  objectUnderTest.TEST_SYNC_DAYS_IN_PAST = newPast
  objectUnderTest.TEST_SYNC_DAYS_IN_FUTURE = newFuture
  const rightStart = new Date()
  const rightEnd = new Date()
  rightStart.setHours(0, 0, 0, 0);
  rightEnd.setHours(0, 0, 0, 0);
  rightStart.setDate(rightStart.getDate() - newPast);
  rightEnd.setDate(rightEnd.getDate() + newFuture);

  const dates = objectUnderTest.GetStartEndDates();
  return dates[0].valueOf() === rightStart.valueOf() && dates[1].valueOf() === rightEnd.valueOf();
})

it('ShouldObfuscate should return false if all flags are false', () => {
  const source = {...baseCal}
  const destination = {...baseCal}
  const event = {...baseGenericEvent}
  return !objectUnderTest.ShouldObfuscate(source, destination, event)
})

it('ShouldObfuscate should return true if source is obfuscateAsOrigin', () => {
  const source = {...baseCal, obfuscateAsOrigin: true}
  const destination = {...baseCal}
  const event = {...baseGenericEvent}
  return objectUnderTest.ShouldObfuscate(source, destination, event)
})

it('ShouldObfuscate should return true if destination is obfuscateAsDestination', () => {
  const source = {...baseCal}
  const destination = {...baseCal, obfuscateAsDestination: true}
  const event = {...baseGenericEvent}
  return objectUnderTest.ShouldObfuscate(source, destination, event)
})

it('ShouldObfuscate should return true if all event IsOnObfuscateList', () => {
  const source = {...baseCal}
  const destination = {...baseCal}
  const event = {...baseGenericEvent}

  //Setup
  mockConsole()
  objectUnderTest.OBFUSCATE_LIST_REGEXES.push(baseGenericEvent.summary)
  const result = objectUnderTest.ShouldObfuscate(source, destination, event)

  // Clean up
  unMockConsole()
  objectUnderTest.OBFUSCATE_LIST_REGEXES.pop()

  return result
})

it('ExistsInDestination should find event in destination when it exists', () => {
  objectUnderTest.TEST_INCLUDE_DESC = true
  const destination = {events: {
    merged: {
      [new Date(1111).toUTCString()]: [{
        summary: `${objectUnderTest.MERGE_PREFIX}Find me`,
        description: 'some desc'
      }]
    }
  }}
  const searchEvent = {
    start: {dateTime: 1111},
    summary: `${objectUnderTest.MERGE_PREFIX}Find me`,
    description: 'some desc'
  }
  const result = objectUnderTest.ExistsInDestination(destination, searchEvent)
  objectUnderTest.TEST_INCLUDE_DESC = false
  return result
})

it('ExistsInDestination should NOT find event in destination when summary does not match', () => {
  const destination = {events: {
    merged: {
      [new Date(1111).toUTCString()]: [{
        summary: `${objectUnderTest.MERGE_PREFIX}Do not find me`,
        description: 'asdf'
      }]
    }
  }}
  const searchEvent = {
    start: {dateTime: 1111},
    summary: 'Will not find anything',
    description: 'asdf'
  }
  return !objectUnderTest.ExistsInDestination(destination, searchEvent)
})

it('ExistsInDestination should NOT find event in destination when description does not match; not obscured', () => {
  objectUnderTest.TEST_INCLUDE_DESC = true
  const destination = {events: {
    merged: {
      [new Date(1111).toUTCString()]: [{
        summary: `${objectUnderTest.MERGE_PREFIX}Matches`,
        description: 'two'
      }]
    }
  }}
  const searchEvent = {
    start: {dateTime: 1111},
    summary: `${objectUnderTest.MERGE_PREFIX}Matches`,
    description: 'one'
  }
  return !objectUnderTest.ExistsInDestination(destination, searchEvent)
})

it('ExistsInDestination should NOT find event in destination when description does not match; is obscured', () => {
  objectUnderTest.TEST_INCLUDE_DESC = false
  const destination = {events: {
    merged: {
      [new Date(1111).toUTCString()]: [{
        summary: `${objectUnderTest.MERGE_PREFIX}Matches`,
        description: 'should be obscured'
      }]
    }
  }}
  const searchEvent = {
    start: {dateTime: 1111},
    summary: 'Matches',
    description: objectUnderTest.DESC_NOT_COPIED_MSG,
  }
  return !objectUnderTest.ExistsInDestination(destination, searchEvent)
})

it('ExistsInDestination should NOT find event in destination when location does not match; is obscured', () => {
  objectUnderTest.TEST_INCLUDE_DESC = false
  const destination = {events: {
    merged: {
      [new Date(1111).toUTCString()]: [{
        summary: `${objectUnderTest.MERGE_PREFIX}Matches`,
        description: objectUnderTest.DESC_NOT_COPIED_MSG,
        location: objectUnderTest.LOC_NOT_COPIED_MSG,
      }]
    }
  }}
  const searchEvent = {
    start: {dateTime: 1111},
    summary: 'Matches',
    description: objectUnderTest.DESC_NOT_COPIED_MSG,
    location: 'the real location',
  }
  return !objectUnderTest.ExistsInDestination(destination, searchEvent)
})

it('ExistsInOrigin should find event in origin when it exists', () => {
  objectUnderTest.TEST_INCLUDE_DESC = true
  const origin = {...baseCal,
    events: {
      primary: {
        [new Date(1111).toUTCString()]: [{ summary: 'Find me' }]
      }
  }}
  const destination = {...baseCal}
  const mergedEvent = {
    start: {dateTime: 1111},
    summary: `${objectUnderTest.MERGE_PREFIX}Find me`
  }
  const result = objectUnderTest.ExistsInOrigin(origin, destination, mergedEvent)
  objectUnderTest.TEST_INCLUDE_DESC = false
  return result
})

it('ExistsInOrigin should NOT find event in origin when it does not exist', () => {
  const origin = {...baseCal,
    events: {
      primary: {
        [new Date(1111).toUTCString()]: [{ summary: 'Do not find me' }]
      }
    }
  }
  const destination = {...baseCal}
  const mergedEvent = {
    start: {dateTime: 1111},
    summary: `${objectUnderTest.MERGE_PREFIX}Will not find anything`,
    description: objectUnderTest.DESC_NOT_COPIED_MSG,
  }
  return !objectUnderTest.ExistsInOrigin(origin, destination, mergedEvent)
})

it('ExistsInOrigin should NOT find event in origin when location is obscured', () => {
  const origin = {...baseCal,
    obfuscateAsOrigin: true,
    events: {
    primary: {
      [new Date(1111).toUTCString()]: [{
        summary: 'I changed to obscured',
        location: 'the real location',
        description: objectUnderTest.DESC_NOT_COPIED_MSG,
      }]
    }
  }}
  const destination = {...baseCal}
  const mergedEvent = {
    start: {dateTime: 1111},
    summary: `${objectUnderTest.MERGE_PREFIX}I changed to obscured`,
    location: 'the real location',
    description: objectUnderTest.DESC_NOT_COPIED_MSG,
  }
  return !objectUnderTest.ExistsInOrigin(origin, destination, mergedEvent)
})

it('ExistsInOrigin should find obfuscated summary in origin when shouldObfuscate marked', () => {
  const origin = {...baseCal,
    obfuscateAsOrigin: true,
    events: {
      primary: {
        [new Date(1111).toUTCString()]: [{
          summary: 'Primary holds real data but obfuscateAsOrigin is true',
        }]
      }
    }
  }
  const destination = {...baseCal}
  const mergedEvent = {
    start: {dateTime: 1111},
    summary: `${objectUnderTest.MERGE_PREFIX}${objectUnderTest.SUMMARY_NOT_COPIED_MSG}`,
    location: objectUnderTest.LOC_NOT_COPIED_MSG,
    description: objectUnderTest.DESC_NOT_COPIED_MSG,
  }
  return objectUnderTest.ExistsInOrigin(origin, destination, mergedEvent)
})

it('should end up with events in primary', () => {
  const primaryEvent = {
    start: {dateTime: 1111},
    summary: 'I am primary event',
  }
  const {primary, merged} = objectUnderTest.SortEvents([primaryEvent])
  const primaryDateTime = primary[new Date(1111).toUTCString()]
  return primaryDateTime.length === 1 && primaryDateTime[0].summary === primaryEvent.summary
})

it('should end up with events in merged', () => {
  const mergedEvent = {
    start: {dateTime: 1111},
    summary: `${objectUnderTest.MERGE_PREFIX}I am merged event`,
  }
  const {primary, merged} = objectUnderTest.SortEvents([mergedEvent])
  const mergedDateTime = merged[new Date(1111).toUTCString()]
  return mergedDateTime.length === 1 && mergedDateTime[0].summary === mergedEvent.summary
})

it('should obfuscate the summary, description, and location of a matched event', () => {
  objectUnderTest.TEST_INCLUDE_DESC = true // description sync turned on should be overridden
  const obfuscatePattern = '(S|s)ensitive'
  objectUnderTest.OBFUSCATE_LIST_REGEXES.push(obfuscatePattern)
  const primaryEvent = {
    start: {dateTime: 3333},
    summary: 'I am a sensitive event',
    description: 'blah blah',
    location: 'secret lair',
  }
  mockConsole()
  const calendar = objectUnderTest.SortEvents([primaryEvent])
  const loggedOnce = console.calls.log.length === 1
  // Clean up
  unMockConsole()
  const primaryDateTime = calendar.primary[new Date(3333).toUTCString()]
  const isSummaryObfuscated = primaryDateTime[0].summary === objectUnderTest.SUMMARY_NOT_COPIED_MSG
  const isDescObfuscated = primaryDateTime[0].description === objectUnderTest.DESC_NOT_COPIED_MSG
  const isLocObfuscated = primaryDateTime[0].location === objectUnderTest.LOC_NOT_COPIED_MSG
  objectUnderTest.OBFUSCATE_LIST_REGEXES.pop()

  return primaryDateTime.length === 1 && isSummaryObfuscated && isDescObfuscated && isLocObfuscated && loggedOnce
})

it('should filter off ignore regexes', () => {
  const ignorable = 'TEST ignore me'
  objectUnderTest.IGNORE_LIST_REGEXES.push(ignorable)
  const event = {
    start: {dateTime: 1111},
    summary: ignorable,
  }
  mockConsole()
  const result = objectUnderTest.IsOnIgnoreList(event)
  const loggedOnce = console.calls.log.length === 1
  // Cleanup
  unMockConsole()
  objectUnderTest.IGNORE_LIST_REGEXES.pop()

  return result && loggedOnce
})

it('should NOT filter off ignore regexes', () => {
  const ignorable = 'TEST ignore me'
  objectUnderTest.IGNORE_LIST_REGEXES.push(ignorable)
  const event = {
    start: {dateTime: 1111},
    summary: '2 legit 2 quit',
  }
  const result = !objectUnderTest.IsOnIgnoreList(event)
  objectUnderTest.IGNORE_LIST_REGEXES.pop()
  return result
})

it('should match a summary to obfuscate', () => {
  const obfuscatePattern = '(S|s)ensitive'
  objectUnderTest.OBFUSCATE_LIST_REGEXES.push(obfuscatePattern)
  const event = {
    start: {dateTime: 1111},
    summary: 'Blah Sensitive foo bar',
  }
  mockConsole()
  const result = objectUnderTest.IsOnObfuscateList(event)
  const loggedOnce = console.calls.log.length === 1
  // Cleanup
  unMockConsole()
  objectUnderTest.OBFUSCATE_LIST_REGEXES.pop()

  return result && loggedOnce
})

it('should NOT match a summary to obfuscate', () => {
  const obfuscatePattern = '(S|s)ensitive'
  objectUnderTest.OBFUSCATE_LIST_REGEXES.push(obfuscatePattern)
  const event = {
    start: {dateTime: 1111},
    summary: 'Just a normal event',
  }
  const result = !objectUnderTest.IsOnObfuscateList(event)
  objectUnderTest.OBFUSCATE_LIST_REGEXES.pop()
  return result
})

it('should return true when COPY_SELF_ATTENDANCE_STATUS is disabled', () => {
  // attendees definitely don't match; would find diff if enabled
  const originEvent = { attendees: {
    self: true
  }}
  const mergedEvent = {}
  return true === objectUnderTest.AttendeeSelfStatusMatches(originEvent, mergedEvent)
})

it('should return [] when COPY_SELF_ATTENDANCE_STATUS is disabled', () => {
  const originEvent = {}
  const destination = {}
  const res = objectUnderTest.GetAttendeeSelf(originEvent, destination)
  return (Array.isArray(res) && res.length === 0)
})

it('should return false when origin and merged have mismatched Attendee status', () => {
  objectUnderTest.TEST_COPY_SELF_ATTENDANCE_STATUS = true;
  const originEvent =  { attendees:
    [{
      email: 'user.email@cheeseburger.com',
      self: true,
      responseStatus: 'accepted'
    }]}
  const mergedEvent = { attendees:
    [{
      email: 'user.email@turducken.com',
      self: true,
      responseStatus: 'needsAction'
    }]}
  const res1 = (false === objectUnderTest.AttendeeSelfStatusMatches(originEvent, mergedEvent))
  const res2 = (false === objectUnderTest.AttendeeSelfStatusMatches({attendees: []}, mergedEvent))

  return res1 & res2
})

it('should return self attendee with updated email', () => {
  objectUnderTest.TEST_COPY_SELF_ATTENDANCE_STATUS = true;
  const originEvent = { attendees:
    [{
      email: 'user.email@cheeseburger.com',
      self: true,
      responseStatus: 'needsAction'
    },
    {
      email: 'a.real.jerk@cheeseburger.com',
      responseStatus: 'accepted'
    }]}
  const destination = {address: 'another.email.address@whatever.com'}
  const res = objectUnderTest.GetAttendeeSelf(originEvent, destination)
  return (Array.isArray(res) &&
    res[0].email === destination.address &&
    res[0].self === originEvent.attendees[0].self &&
    res[0].responseStatus === originEvent.attendees[0].responseStatus);
})

it('ParseEvent should pass data through by default', () => {
  const calObject = {
    ...baseCal,
  }

  const mocked = {
    qty: 0,
    increment: function () {
      this.qty++;
      return "anId@google.com"
    },
  }

  const event = {
    ...baseParseEvent,
    getId: mocked.increment.bind(mocked),
  }

  const result = objectUnderTest.ParseEvent(calObject, event)

  const isSummaryPassed = result.summary === event.summary
  const isDescPassed = result.description === event.description
  const isLocPassed = result.location === event.location
  const getIdCalled = mocked.qty === 1

  return  isSummaryPassed && isDescPassed && isLocPassed && getIdCalled
})


it('GenerateCreatePayload should pass data through by default', () => {
  const source = {...baseCal}
  const destination = {...baseCal}
  const event = {...baseGenericEvent}
  const expectedSummary = `${objectUnderTest.MERGE_PREFIX}${event.summary}`

  const result = objectUnderTest.GenerateCreatePayload(source, destination, event)

  const isSummaryPassed = result.summary === expectedSummary
  const isDescPassed = result.description === event.description
  const isLocPassed = result.location === event.location

  return  isSummaryPassed && isDescPassed && isLocPassed
})

it('GenerateCreatePayload should respect obfuscation (test one kind here)', () => {
  const source = {...baseCal}
  const destination = {
    ...baseCal,
    obfuscateAsDestination: true,
  }

  const event = {
    ...baseGenericEvent
  }
  const expectedSummary = `${objectUnderTest.MERGE_PREFIX}${objectUnderTest.SUMMARY_NOT_COPIED_MSG}`

  const result = objectUnderTest.GenerateCreatePayload(source, destination, event)

  const isSummaryObfuscated = result.summary === expectedSummary
  const isDescObfuscated = result.description === objectUnderTest.DESC_NOT_COPIED_MSG
  const isLocObfuscated = result.location === objectUnderTest.LOC_NOT_COPIED_MSG

  return  isSummaryObfuscated && isDescObfuscated && isLocObfuscated
})

function it(msg, fn) {
  try {
    if (fn()) {
      real_console.info(`PASS: ${msg}`)
      return
    }
    real_console.warn(`FAIL(assertion): ${msg}`)
  } catch (err) {
    real_console.error(`FAIL(error): ${msg}; error=${err.toString()}`)
  } finally {
    // Just in case a test mocks, then throws an error
    unMockConsole()
  }
  process.exitCode = 1
}

function fakeConsoleGen () {
  return {
    calls: {
      log: [],
      error: [],
    },
    log: function (msg) {
      this.calls.log.push(msg)
    },
    error: function (msg) {
      this.calls.error.push(msg)
    },
  }
}
