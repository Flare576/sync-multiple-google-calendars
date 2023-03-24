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
  start: {dateTime: 1111},
  end: {dateTime: 2222},
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

const baseMergedEvent = {
  ...baseGenericEvent,
  summary: `${objectUnderTest.MERGE_PREFIX}${baseEvent.summary}`,
  description: objectUnderTest.DESC_NOT_COPIED_MSG, // Most users will use the default of not including desc
}

const baseCal = {
  address: 'calendar-id1@company.com',
  provider: 'google',
  obfuscateAsDestination: false,
  obfuscateAsOrigin: false,
}

it('GetStartEndDates_ should use the right date range', () => {
  const rightStart = new Date()
  const rightEnd = new Date()
  rightStart.setHours(0, 0, 0, 0);
  rightEnd.setHours(0, 0, 0, 0);
  rightStart.setDate(rightStart.getDate() - objectUnderTest.SYNC_DAYS_IN_PAST);
  rightEnd.setDate(rightEnd.getDate() + objectUnderTest.SYNC_DAYS_IN_FUTURE);

  const dates = objectUnderTest.GetStartEndDates_();
  return dates[0].valueOf() === rightStart.valueOf() && dates[1].valueOf() === rightEnd.valueOf();
})

it('GetStartEndDates_ should use the right date range if modified', () => {
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

  const dates = objectUnderTest.GetStartEndDates_();
  return dates[0].valueOf() === rightStart.valueOf() && dates[1].valueOf() === rightEnd.valueOf();
})

it('ShouldObfuscate_ should return false if all flags are false', () => {
  const source = {...baseCal}
  const destination = {...baseCal}
  const event = {...baseGenericEvent}
  return !objectUnderTest.ShouldObfuscate_(source, destination, event)
})

it('ShouldObfuscate_ should return true if source is obfuscateAsOrigin', () => {
  const source = {...baseCal, obfuscateAsOrigin: true}
  const destination = {...baseCal}
  const event = {...baseGenericEvent}
  return objectUnderTest.ShouldObfuscate_(source, destination, event)
})

it('ShouldObfuscate_ should return true if destination is obfuscateAsDestination', () => {
  const source = {...baseCal}
  const destination = {...baseCal, obfuscateAsDestination: true}
  const event = {...baseGenericEvent}
  return objectUnderTest.ShouldObfuscate_(source, destination, event)
})

it('ShouldObfuscate_ should return true if all event IsOnObfuscateList', () => {
  const source = {...baseCal}
  const destination = {...baseCal}
  const event = {...baseGenericEvent}

  //Setup
  mockConsole()
  objectUnderTest.OBFUSCATE_LIST_REGEXES.push(baseGenericEvent.summary)
  const result = objectUnderTest.ShouldObfuscate_(source, destination, event)

  // Clean up
  unMockConsole()
  objectUnderTest.OBFUSCATE_LIST_REGEXES.pop()

  return result
})

it('ExistsInDestination_ should find event in destination when it exists', () => {
  const destination = {events: {
    merged: {
      [new Date(1111).toUTCString()]: [{
        ...baseMergedEvent,
      }]
    }
  }}
  const searchEvent = {
    start: {dateTime: 1111},
    ...baseMergedEvent,
  }
  return objectUnderTest.ExistsInDestination_(destination, searchEvent)
})

it('ExistsInDestination_ should NOT find event in destination when summary does not match', () => {
  const destination = {events: {
    merged: {
      [new Date(1111).toUTCString()]: [{
        ...baseMergedEvent,
      }]
    }
  }}
  const searchEvent = {
    ...baseEvent,
    summary: 'Will not find anything',
  }
  return !objectUnderTest.ExistsInDestination_(destination, searchEvent)
})

it('ExistsInDestination_ should NOT find event in destination when description does not match', () => {
  const destination = {events: {
    merged: {
      [new Date(1111).toUTCString()]: [{
        ...baseMergedEvent,
        description: 'two'
      }]
    }
  }}
  const searchEvent = {
    ...baseMergedEvent,
    description: 'one'
  }
  return !objectUnderTest.ExistsInDestination_(destination, searchEvent)
})

it('ExistsInDestination_ should NOT find event in destination when endDate does not match', () => {
  const destination = {events: {
    merged: {
      [new Date(1111).toUTCString()]: [{
        ...baseMergedEvent,
      }]
    }
  }}
  const searchEvent = {
    ...baseMergedEvent,
    end: {dateTime: 3333},
  }
  return !objectUnderTest.ExistsInDestination_(destination, searchEvent)
})

it('ExistsInDestination_ should NOT find event in destination when location does not match', () => {
  const destination = {events: {
    merged: {
      [new Date(1111).toUTCString()]: [{
        ...baseMergedEvent,
        location: objectUnderTest.LOC_NOT_COPIED_MSG,
      }]
    }
  }}
  const searchEvent = {
    ...baseMergedEvent,
    location: 'the real location',
  }
  return !objectUnderTest.ExistsInDestination_(destination, searchEvent)
})

it('ExistsInOrigin_ should find event in origin when it exists', () => {
  const origin = {...baseCal,
    events: {
      primary: {
        [new Date(1111).toUTCString()]: [{
          ...baseEvent,
        }]
      }
  }}
  const destination = {...baseCal}
  const mergedEvent = {
    ...baseMergedEvent,
  }
  return objectUnderTest.ExistsInOrigin_(origin, destination, mergedEvent)
})

it('ExistsInOrigin_ should find event in origin when it exists when keeping desc', () => {
  objectUnderTest.TEST_INCLUDE_DESC = true
  const origin = {...baseCal,
    events: {
      primary: {
        [new Date(1111).toUTCString()]: [{
          ...baseEvent,
        }]
      }
  }}
  const destination = {...baseCal}
  const mergedEvent = {
    ...baseMergedEvent,
    description: baseEvent.description,
  }
  const result = objectUnderTest.ExistsInOrigin_(origin, destination, mergedEvent)
  objectUnderTest.TEST_INCLUDE_DESC = false
  return result
})

it('ExistsInOrigin_ should NOT find event in origin when it does not have prefix', () => {
  const origin = {...baseCal,
    events: {
      primary: {
        [new Date(1111).toUTCString()]: [{
          ...baseEvent,
        }]
      }
  }}
  const destination = {...baseCal}
  const mergedEvent = {
    ...baseEvent,
  }
  return !objectUnderTest.ExistsInOrigin_(origin, destination, mergedEvent)
})

it('ExistsInOrigin_ should NOT find event in origin when it does not exist', () => {
  const origin = {...baseCal,
    events: {
      primary: {
        [new Date(1111).toUTCString()]: [{
          ...baseEvent,
        }]
      }
  }}
  const destination = {...baseCal}
  const mergedEvent = {
    ...baseEvent,
    summary: `${objectUnderTest.MERGE_PREFIX}Will not find anything`,
  }
  return !objectUnderTest.ExistsInOrigin_(origin, destination, mergedEvent)
})

it('ExistsInOrigin_ should NOT find event in origin when location is obscured', () => {
  const origin = {...baseCal,
    events: {
      primary: {
        [new Date(1111).toUTCString()]: [{
          ...baseEvent,
        }]
      }
  }}
  const destination = {...baseCal}
  const mergedEvent = {
    ...baseEvent,
    location: `${objectUnderTest.LOC_NOT_COPIED_MSG}`,
  }
  return !objectUnderTest.ExistsInOrigin_(origin, destination, mergedEvent)
})

it('ExistsInOrigin_ should NOT find event in origin when end is different', () => {
  const origin = {...baseCal,
    events: {
      primary: {
        [new Date(1111).toUTCString()]: [{
          ...baseEvent,
        }]
      }
  }}
  const destination = {...baseCal}
  const mergedEvent = {
    ...baseMergedEvent,
    end: {dateTime: 3333},
  }
  return !objectUnderTest.ExistsInOrigin_(origin, destination, mergedEvent)
})

it('ExistsInOrigin_ should find obfuscated summary in origin when shouldObfuscate marked', () => {
  const origin = {...baseCal,
    obfuscateAsOrigin: true,
    events: {
      primary: {
        [new Date(1111).toUTCString()]: [{
          ...baseEvent,
          summary: 'Primary holds real data but obfuscateAsOrigin is true',
        }]
      }
    }
  }
  const destination = {...baseCal}
  const mergedEvent = {
    ...baseEvent,
    summary: `${objectUnderTest.MERGE_PREFIX}${objectUnderTest.SUMMARY_NOT_COPIED_MSG}`,
    location: objectUnderTest.LOC_NOT_COPIED_MSG,
    description: objectUnderTest.DESC_NOT_COPIED_MSG,
  }
  return objectUnderTest.ExistsInOrigin_(origin, destination, mergedEvent)
})

it('SortEvents_ should end up with events in primary', () => {
  const primaryEvent = {
    start: {dateTime: 1111},
    summary: 'I am primary event',
  }
  const {primary, merged} = objectUnderTest.SortEvents_([primaryEvent])
  const primaryDateTime = primary[new Date(1111).toUTCString()]
  return primaryDateTime.length === 1 && primaryDateTime[0].summary === primaryEvent.summary
})

it('SortEvents_ should end up with events in merged', () => {
  const mergedEvent = {
    start: {dateTime: 1111},
    summary: `${objectUnderTest.MERGE_PREFIX}I am merged event`,
  }
  const {primary, merged} = objectUnderTest.SortEvents_([mergedEvent])
  const mergedDateTime = merged[new Date(1111).toUTCString()]
  return mergedDateTime.length === 1 && mergedDateTime[0].summary === mergedEvent.summary
})

it('SortEvents_ should obfuscate the summary, description, and location of a matched event', () => {
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
  const calendar = objectUnderTest.SortEvents_([primaryEvent])
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

it('IsOnIgnoreList_ should filter off ignore regexes', () => {
  const ignorable = 'TEST ignore me'
  objectUnderTest.IGNORE_LIST_REGEXES.push(ignorable)
  const event = {
    start: {dateTime: 1111},
    summary: ignorable,
  }
  mockConsole()
  const result = objectUnderTest.IsOnIgnoreList_(event)
  const loggedOnce = console.calls.log.length === 1
  // Cleanup
  unMockConsole()
  objectUnderTest.IGNORE_LIST_REGEXES.pop()

  return result && loggedOnce
})

it('IsOnIgnoreList_ should NOT filter off ignore regexes', () => {
  const ignorable = 'TEST ignore me'
  objectUnderTest.IGNORE_LIST_REGEXES.push(ignorable)
  const event = {
    start: {dateTime: 1111},
    summary: '2 legit 2 quit',
  }
  const result = !objectUnderTest.IsOnIgnoreList_(event)
  objectUnderTest.IGNORE_LIST_REGEXES.pop()
  return result
})

it('IsOnObfuscateList should match a summary to obfuscate', () => {
  const obfuscatePattern = '(S|s)ensitive'
  objectUnderTest.OBFUSCATE_LIST_REGEXES.push(obfuscatePattern)
  const event = {
    start: {dateTime: 1111},
    summary: 'Blah Sensitive foo bar',
  }
  mockConsole()
  const result = objectUnderTest.IsOnObfuscateList_(event)
  const loggedOnce = console.calls.log.length === 1
  // Cleanup
  unMockConsole()
  objectUnderTest.OBFUSCATE_LIST_REGEXES.pop()

  return result && loggedOnce
})

it('IsOnObfuscateList_ should NOT match a summary to obfuscate', () => {
  const obfuscatePattern = '(S|s)ensitive'
  objectUnderTest.OBFUSCATE_LIST_REGEXES.push(obfuscatePattern)
  const event = {
    start: {dateTime: 1111},
    summary: 'Just a normal event',
  }
  const result = !objectUnderTest.IsOnObfuscateList_(event)
  objectUnderTest.OBFUSCATE_LIST_REGEXES.pop()
  return result
})

it('AttendeeSelfStatusMatches_ should return true when COPY_SELF_ATTENDANCE_STATUS is disabled', () => {
  // attendees definitely don't match; would find diff if enabled
  const originEvent = { attendees: {
    self: true
  }}
  const mergedEvent = {}
  return true === objectUnderTest.AttendeeSelfStatusMatches_(originEvent, mergedEvent)
})

it('AttendeeSelfStatusMatches_ should return [] when COPY_SELF_ATTENDANCE_STATUS is disabled', () => {
  const originEvent = {}
  const destination = {}
  const res = objectUnderTest.GetAttendeeSelf_(originEvent, destination)
  return (Array.isArray(res) && res.length === 0)
})

it('AttendeeSelfStatusMatches_ should return false when origin and merged have mismatched Attendee status', () => {
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
  const res1 = (false === objectUnderTest.AttendeeSelfStatusMatches_(originEvent, mergedEvent))
  const res2 = (false === objectUnderTest.AttendeeSelfStatusMatches_({attendees: []}, mergedEvent))

  return res1 & res2
})

it('AttendeeSelfStatusMatches_ should return self attendee with updated email', () => {
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
  const res = objectUnderTest.GetAttendeeSelf_(originEvent, destination)
  return (Array.isArray(res) &&
    res[0].email === destination.address &&
    res[0].self === originEvent.attendees[0].self &&
    res[0].responseStatus === originEvent.attendees[0].responseStatus);
})

it('ParseEvent_ should pass data through by default', () => {
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

  const result = objectUnderTest.ParseEvent_(calObject, event)

  const isSummaryPassed = result.summary === event.summary
  const isDescPassed = result.description === event.description
  const isLocPassed = result.location === event.location
  const getIdCalled = mocked.qty === 1

  return  isSummaryPassed && isDescPassed && isLocPassed && getIdCalled
})


it('GenerateCreatePayload_ should pass data through by default', () => {
  // Setup
  objectUnderTest.TEST_INCLUDE_DESC = true

  const source = {...baseCal}
  const destination = {...baseCal}
  const event = {...baseGenericEvent}
  const expectedSummary = `${objectUnderTest.MERGE_PREFIX}${event.summary}`

  const result = objectUnderTest.GenerateCreatePayload_(source, destination, event)

  const isSummaryPassed = result.summary === expectedSummary
  const isDescPassed = result.description === event.description
  const isLocPassed = result.location === event.location

  // Cleanup
  objectUnderTest.TEST_INCLUDE_DESC = undefined

  return  isSummaryPassed && isDescPassed && isLocPassed
})

it('GenerateCreatePayload_ should respect obfuscation (test one kind here)', () => {
  const source = {...baseCal}
  const destination = {
    ...baseCal,
    obfuscateAsDestination: true,
  }

  const event = {
    ...baseGenericEvent
  }
  const expectedSummary = `${objectUnderTest.MERGE_PREFIX}${objectUnderTest.SUMMARY_NOT_COPIED_MSG}`

  const result = objectUnderTest.GenerateCreatePayload_(source, destination, event)

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
    objectUnderTest.TEST_INCLUDE_DESC = undefined
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
