// Based on https://github.com/tanaikech/BatchRequest

class MicrosoftBatchRequest {
  constructor(obj) {
    if (!obj.hasOwnProperty('requests')) {
      throw new Error("'requests' property was not found in object.");
    }

    this.reqs = obj.requests.slice();
    this.url = 'https://graph.microsoft.com/v1.0/$batch';

    this.accessToken = obj.accessToken;

    return this.enhancedDo();
  }

  enhancedDo() {
    const limit = 20;
    const split = Math.ceil(this.reqs.length / limit);

    if (typeof UrlFetchApp.fetchAll === 'function') {
      const reqs = [];
      var i = 0;
      var j = 0;

      for (; 0 <= split ? j < split : j > split; i = 0 <= split ? ++j : --j) {
        const params = this.createRequest(this.reqs.splice(0, limit));
        params.url = this.url;
        reqs.push(params);
      }

      const res = UrlFetchApp.fetchAll(reqs).reduce((array, item) => {
        if (item.getResponseCode() !== 200) {
          array.push(item.getContentText());
        } else {
          array = array.concat(this.parser(item.getContentText()));
        }
        return array;
      }, []);

      return res;
    }

    var allResponses = [];
    var i = 0;
    var k = 0;
    for (; 0 <= split ? k < split : k > split; i = 0 <= split ? ++k : --k) {
      const params = this.createRequest(this.reqs.splice(0, limit));

      const response = UrlFetchApp.fetch(this.url, params);

      if (response.getResponseCode() !== 200) {
        allResponses.push(response.getContentText());
      } else {
        allResponses = allResponses.concat(
          this.parser(response.getContentText())
        );
      }
    }

    return allResponses;
  }

  parser(contentText) {
    return JSON.stringify(JSON.parse(contentText), null, 2);
  }

  createRequest(calls) {
    let contentId = 0;
    const requests = calls.map(call => {
      const request = {
        id: ++contentId,
        method: call.method,
        url: call.endpoint,
      }
      if (call.requestBody) {
        request.body = call.requestBody;
        request.headers = {
          'Content-Type': 'application/json',
        };
      }
      return request;
    });

    return {
      muteHttpExceptions: true,
      method: 'POST',
      payload: JSON.stringify({requests}),
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    };
  }
}
