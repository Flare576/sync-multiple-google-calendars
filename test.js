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


it('GetStartEndDates should use the right date range', () => {
  const rightStart = new Date()
  const rightEnd = new Date()
  rightStart.setHours(0, 0, 0, 0);
  rightEnd.setHours(0, 0, 0, 0);
  rightStart.setDate(rightStart.getDate() - objectUnderTest.SYNC_DAYS_IN_PAST);
  rightEnd.setDate(rightEnd.getDate() + objectUnderTest.SYNC_DAYS_IN_FUTURE);

  const dates = objectUnderTest.GetStartEndDates();
  return dates[0].valueOf() === rightStart.valueOf() && dates[1].valueOf() === rightEnd.valueOf();
})

it('GetStartEndDates should use the right date range if modified', () => {
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

it('ExistsInOrigin should find event in origin when it exists and destination is obfuscated', () => {
  const origin = {
    events: {
      primary: {
        [new Date(1111).toUTCString()]: [{ summary: 'Find me' }]
      },
    },
  };
  const destination = { obfuscateTo: true };
  const mergedEvent = {
    start: {dateTime: 1111},
    summary: `${objectUnderTest.MERGE_PREFIX}Find me`
  }
  return objectUnderTest.ExistsInOrigin(origin, destination, mergedEvent)
})

it('ExistsInOrigin should find event in origin when it exists and destination is not obfuscated', () => {
  const origin = {
    events: {
      primary: {
        [new Date(1111).toUTCString()]: [{ summary: 'Find me' }]
      },
    },
  };
  const destination = { obfuscateTo: false };
  const mergedEvent = {
    start: {dateTime: 1111},
    summary: `${objectUnderTest.MERGE_PREFIX}Find me`
  }
  return objectUnderTest.ExistsInOrigin(origin, destination, mergedEvent)
})

it('ExistsInOrigin should NOT find event in origin when it does not exist', () => {
  const origin = {
    events: {
      primary: {
        [new Date(1111).toUTCString()]: [{ summary: 'Do not find me' }]
      },
    },
  };
  const destination = { obfuscateTo: false };
  const mergedEvent = {
    start: {dateTime: 1111},
    summary: `${objectUnderTest.MERGE_PREFIX}Will not find anything`
  }
  return !objectUnderTest.ExistsInOrigin(origin, destination,  mergedEvent)
})

it('ExistsInOrigin should NOT find event in origin when location is obscured', () => {
  const origin = {
    events: {
      primary: {
        [new Date(1111).toUTCString()]: [{
          summary: 'I changed to obscured',
          location: objectUnderTest.LOC_NOT_COPIED_MSG,
        }]
      },
    },
  };
  const destination = { obfuscateTo: false };
  const mergedEvent = {
    start: {dateTime: 1111},
    summary: `${objectUnderTest.MERGE_PREFIX}I changed to obscured`,
    location: 'the real location',
  }
  return !objectUnderTest.ExistsInOrigin(origin, destination, mergedEvent)
})

it('ExistsInDestination should find event in destination when it exists and destination is not obfuscated', () => {
  objectUnderTest.TEST_INCLUDE_DESC = true
  const destination = {
    obfuscateTo: false,
    events: {
      merged: {
        [new Date(1111).toUTCString()]: [{
          summary: `${objectUnderTest.MERGE_PREFIX}Find me`,
          description: 'some desc'
        }],
      },
    },
  };
  const originEvent = {
    start: {dateTime: 1111},
    summary: 'Find me',
    description: 'some desc'
  }
  return objectUnderTest.ExistsInDestination(destination, originEvent)
})

it('ExistsInDestination should find event in destination when it exists and destination is obfuscated', () => {
  objectUnderTest.TEST_INCLUDE_DESC = true
  const destination = {
    obfuscateTo: true,
    events: {
      merged: {
      [new Date(1111).toUTCString()]: [{
        summary: `${objectUnderTest.MERGE_PREFIX}${objectUnderTest.SUMMARY_NOT_COPIED_MSG}`,
        description: `${objectUnderTest.DESC_NOT_COPIED_MSG}`,
        location: `${objectUnderTest.LOC_NOT_COPIED_MSG}`,
      }]
    },
  }}
  const originEvent = {
    start: {dateTime: 1111},
    summary: 'Find me',
    description: 'some desc'
  }
  return objectUnderTest.ExistsInDestination(destination, originEvent)
})

it('ExistsInDestination should NOT find event in destination when summary does not match and is not obfuscated', () => {
  const destination = {
    obfuscateTo: false,
    events: {
      merged: {
        [new Date(1111).toUTCString()]: [{
          summary: `${objectUnderTest.MERGE_PREFIX}Do not find me`,
          description: 'asdf'
        }]
      },
    },
  };
  const originEvent = {
    start: {dateTime: 1111},
    summary: 'Will not find anything',
    description: 'asdf'
  }
  return !objectUnderTest.ExistsInDestination(destination, originEvent)
})

it('ExistsInDestination should NOT find event in destination when description does not match; not obscured', () => {
  objectUnderTest.TEST_INCLUDE_DESC = true
  const destination = {
    obfuscateTo: false,
    events: {
      merged: {
        [new Date(1111).toUTCString()]: [{
          summary: `${objectUnderTest.MERGE_PREFIX}Matches`,
          description: objectUnderTest.DESC_NOT_COPIED_MSG
        }]
      },
    },
  }
  const originEvent = {
    start: {dateTime: 1111},
    summary: 'Matches',
    description: 'one'
  }
  return !objectUnderTest.ExistsInDestination(destination, originEvent)
})

it('ExistsInDestination should NOT find event in destination when description does not match; is obscured', () => {
  objectUnderTest.TEST_INCLUDE_DESC = false
  const destination = {
    obfuscateTo: false,
    events: {
      merged: {
        [new Date(1111).toUTCString()]: [{
          summary: `${objectUnderTest.MERGE_PREFIX}Matches`,
          description: 'should be obscured'
        }],
      },
    },
  };
  const originEvent = {
    start: {dateTime: 1111},
    summary: 'Matches',
    description: 'one'
  }
  return !objectUnderTest.ExistsInDestination(destination, originEvent)
})

it('ExistsInDestination should NOT find event in destination when location does not match; is obscured', () => {
  objectUnderTest.TEST_INCLUDE_DESC = false
  const destination = {
    obfuscateTo: false,
    events: {
      merged: {
        [new Date(1111).toUTCString()]: [{
          summary: `${objectUnderTest.MERGE_PREFIX}Matches`,
          description: objectUnderTest.DESC_NOT_COPIED_MSG,
          location: objectUnderTest.LOC_NOT_COPIED_MSG,
        }],
      },
    },
  };
  const originEvent = {
    start: {dateTime: 1111},
    summary: 'Matches',
    description: objectUnderTest.DESC_NOT_COPIED_MSG,
    location: 'the real location',
  }
  return !objectUnderTest.ExistsInDestination(destination, originEvent)
})

it('SortEvents should end up with events in primary', () => {
  const primaryEvent = {
    start: {dateTime: 1111},
    summary: 'I am primary event',
  }
  const calendar = objectUnderTest.SortEvents([primaryEvent])
  const primaryDateTime = calendar.primary[new Date(1111).toUTCString()]
  return primaryDateTime.length === 1 && primaryDateTime[0].summary === primaryEvent.summary
})

it('SortEvents should end up with events in merged', () => {
  const mergedEvent = {
    start: {dateTime: 1111},
    summary: `${objectUnderTest.MERGE_PREFIX}I am merged event`,
  }
  const calendar = objectUnderTest.SortEvents([mergedEvent])
  const mergedDateTime = calendar.merged[new Date(1111).toUTCString()]
  return mergedDateTime.length === 1 && mergedDateTime[0].summary === mergedEvent.summary
})

it('IsOnIgnoreList should filter off ignore regexes', () => {
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

it('IsOnIgnoreList should NOT filter off ignore regexes', () => {
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

it('NeedsObfuscation should allow clear-text fields when destination not obfuscated', () => {
  const destination = { obfuscateTo: false };
  const event = {
    start: {dateTime: 1111},
    location: 'Blah Sensitive foo bar',
    description: 'Anything goes',
    summary: 'does not matter',
  }
  const result = objectUnderTest.NeedsObfuscation(destination, event)

  return !result
})

it('NeedsObfuscation should detect clear-text location when destination obfuscated', () => {
  const destination = { obfuscateTo: true };
  const event = {
    start: {dateTime: 1111},
    location: 'Blah Sensitive foo bar',
    description: objectUnderTest.DESC_NOT_COPIED_MSG,
    summary: objectUnderTest.SUMMARY_NOT_COPIED_MSG,
  }
  const result = objectUnderTest.NeedsObfuscation(destination, event)

  return result
})

it('NeedsObfuscation should detect clear-text description when destination obfuscated', () => {
  const destination = { obfuscateTo: true };
  const event = {
    start: {dateTime: 1111},
    location: objectUnderTest.LOC_NOT_COPIED_MSG,
    description: 'Which describes how you are feeling all the time',
    summary: objectUnderTest.SUMMARY_NOT_COPIED_MSG,
  }
  const result = objectUnderTest.NeedsObfuscation(destination, event)

  return result
})

it('NeedsObfuscation should detect clear-text summary when destination obfuscated', () => {
  const destination = { obfuscateTo: true };
  const event = {
    start: {dateTime: 1111},
    location: objectUnderTest.LOC_NOT_COPIED_MSG,
    description: objectUnderTest.DESC_NOT_COPIED_MSG,
    summary: 'blah blah not censored!',
  }
  const result = objectUnderTest.NeedsObfuscation(destination, event)

  return result
})

it('needsObfuscation should detect matching summary when destination not obfuscated', () => {
  const destination = { obfuscateTo: false };
  const obfuscatePattern = '(S|s)ensitive'
  objectUnderTest.OBFUSCATE_LIST_REGEXES.push(obfuscatePattern)
  const event = {
    start: {dateTime: 1111},
    summary: 'Blah Sensitive foo bar',
  }
  mockConsole()
  const result = objectUnderTest.NeedsObfuscation(destination, event)
  const loggedOnce = console.calls.log.length === 1
  // Cleanup
  unMockConsole()
  objectUnderTest.OBFUSCATE_LIST_REGEXES.pop()

  return result && loggedOnce
})

it('IsOnObfuscateList should match a summary to obfuscate', () => {
  const obfuscatePattern = '(S|s)ensitive'
  objectUnderTest.OBFUSCATE_LIST_REGEXES.push(obfuscatePattern)
  const event = {
    start: {dateTime: 1111},
    summary: 'Blah Sensitive foo bar',
  }
  mockConsole()
  const result = objectUnderTest.IsOnObfuscateList(event.summary)
  const loggedOnce = console.calls.log.length === 1
  // Cleanup
  unMockConsole()
  objectUnderTest.OBFUSCATE_LIST_REGEXES.pop()

  return result && loggedOnce
})

it('IsOnObfuscateList should NOT match a summary to obfuscate', () => {
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

it('AttendeeSelfStatusMatches should return false when origin and merged have mismatched Attendee status', () => {
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

  objectUnderTest.TEST_COPY_SELF_ATTENDANCE_STATUS = false; // clean up
  return res1 & res2
})

it('AttendeeSelfStatusMatches should return true when COPY_SELF_ATTENDANCE_STATUS is disabled', () => {
  // attendees definitely don't match; would find diff if enabled
  const originEvent = { attendees: {
    self: true
  }}
  const mergedEvent = {}
  return true === objectUnderTest.AttendeeSelfStatusMatches(originEvent, mergedEvent)
})

it('GetAttendeeSelf should return [] when COPY_SELF_ATTENDANCE_STATUS is disabled', () => {
  const originEvent = {}
  const destination = {}
  const res = objectUnderTest.GetAttendeeSelf(originEvent, destination)
  return (Array.isArray(res) && res.length === 0)
})

it('GetAttendeeSelf should return self attendee with updated email', () => {
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
  const destinationAddress = 'another.email.address@whatever.com'
  const res = objectUnderTest.GetAttendeeSelf(originEvent, destinationAddress)
  return (Array.isArray(res) &&
    res[0].email === destinationAddress &&
    res[0].self === originEvent.attendees[0].self &&
    res[0].responseStatus === originEvent.attendees[0].responseStatus);
})

function it(msg, fn) {
  try {
    if (fn()) {
      console.info(`PASS: ${msg}`)
      return
    }
    console.warn(`FAIL(assertion): ${msg}`)
  } catch (err) {
    console.error(`FAIL(error): ${msg}; error=${err.toString()}`)
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
