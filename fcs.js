/**
 * @author Morgan Conrad
 * Copyright(c) 2018
 * This software is released under the MIT license  (http://opensource.org/licenses/MIT)
 */

const FCSWriteStream = require("./fcswritestream");

/**
 * Constructor
 * @param options   options,  {}, optional argument
 * @param buffer   if present, read it.  (Otherwise, call readFCS() later)
 * @constructor
 */
function FCS(/* optional */ options, buffer) {

  // allow "static" usage, save user from misuse...
  if (!(this instanceof FCS)) return new FCS(options, buffer);

  // important options to always have in meta so they get remembered
  this.meta = {
    dataFormat: FCS.DEFAULT_VALUES.dataFormat,
    groupBy: FCS.DEFAULT_VALUES.groupBy,
  };

  this.header = {};
  this.text = {};
  this.analysis = {};
  this.bytesRead = 0;

  this.dataAsStrings = null;
  this.dataAsNumbers = null;

  this.options(options);

  if (buffer) {
    if (Buffer.isBuffer(buffer))
      this.readBuffer(buffer);
    else
      throw Error("only Buffers supported for now");
  }

  // override the toJSON() method
  this.toJSON = function() {
    // collect meta, header, text, and analysis
    let segmentVals = Object.keys(FCS.SEGMENT).map((key) => {
      let segmentName = FCS.SEGMENT[key];
      return '"' + segmentName + '" :' + JSON.stringify(this[segmentName], null, 2);
    });
    let json = '{\n ' + segmentVals.join(',\n ');

    json += ',\n "data": \n';
    if (this.dataAsStrings) {
      // for clarity, an extra CRLF after groupByParam data
      let delim =
        FCS.OPTION_VALUES.byParam === this.meta.groupBy ? ",\n\n" : ",\n";
      json += "[";
      json += this.dataAsStrings.join(delim);
      json += "]";
    } else if (this.dataAsNumbers)
      json += JSON.stringify(this.dataAsNumbers, null, 2);

    json += "\n}"; // close
    return json;
  };
}

/*
 * Constants for possible incoming option/meta values
 * Also see the defaults below in FCS.DEFAULT_VALUES
 */
module.exports.OPTION_VALUES = FCS.OPTION_VALUES = {
  // .dataFormat should hold one of the following:
  asNumber: "asNumber", // collect data in large numeric arrays
  asString: "asString", // default, just collect data as a String (e.g. all you want is JSON back)
  asBoth: "asBoth", // both
  asNone: "asNone", // skip all the data

  // .groupBy   should hold one of the following:
  byEvent: "byEvent", // data values for each event are grouped together
  byParam: "byParam", // data values for each parameter are grouped together

  /*
          Other option keys that we use are

          .decimalsToPrint   0 means "all events", default = 1000

          .eventsToLoad      0 means none, negative means all

          .maxPerLine        affects printing in byParam for readability

          .encoding          should always be 'utf8' for FCS format


          All other options are ignored by this code, but will be placed into meta.
          So you will see them in the JSON.  In this way you can add your own metadata
          such as the date, laboratory, the filename, error status, etc...
     */
};

/*
 * Default values for the options we use.  In general, you should treat these as constants,
 * but if you really want to change the default behavior I can't stop you...
 */
module.exports.DEFAULT_VALUES = FCS.DEFAULT_VALUES = {
  decimalsToPrint: 2, // 0 means "all events"
  encoding: "utf8",
  eventsToRead: 1000, // an integer, 0 means "all events"
  maxPerLine: 10, // only applies in byParam mode
  dataFormat: "asString", // alternatives are 'asNumber', 'asBoth', 'asNone'
  groupBy: "byEvent", // alternative is 'byParam'
};

module.exports.SEGMENT = FCS.SEGMENT = {
  META: "meta",
  HEADER: "header",
  TEXT: "text",
  ANALYSIS: "analysis",
};

/**
 * Adds properties from options to our meta data, overwriting if necessary
 * @param options   if absent nothing happens.
 * @returns {FCS}   for convenience
 */
FCS.prototype.options = function(options) {
  Object.assign(this.meta, options);
  return this;
};

/**
 * Main method at creation, reads an FCS format file from a databuf
 *
 * @param databuf       required
 * @param moreOptions   optional
 * @returns {FCS}       for convenience
 */
FCS.prototype.readBuffer = function(databuf, /* optional */ moreOptions) {
  // add any moreOptions,  meta is now "complete"
  this.options(moreOptions);

  let encoding = this.meta.encoding || FCS.DEFAULT_VALUES.encoding;
  this.header = this._readHeader(databuf, encoding);

  let textSegment = databuf.toString(
    encoding,
    this.header.beginText,
    this.header.endText,
  );
  this.text = this._readTextOrAnalysis(textSegment);

  this._adjustHeaderBasedUponText(this.text);

  if (this.header.beginAnalysis) {
    let analysisSegment = databuf.toString(
      encoding,
      this.header.beginAnalysis,
      this.header.endAnalysis,
    );
    this.analysis = this._readTextOrAnalysis(analysisSegment);
  }

  // TODO  supplemental text, e.g. $BEGINSTEXT, $ENDSTEXT

  this.dataAsNumbers = null;
  this.dataAsStrings = null;

  this._readData(databuf);

  return this;
};

// here follow the public "getters/accessor" methods

/**
 * All purpose get, called by the other methods
 * @param segment   one of FCS.SEGMENT  (typically 'text',analysis', more rarely 'meta','header')
 * @param keys      if none, returns the entire segment
 *                  otherwise, return first property match
 * @returns         {} if no-arg, else String, null if none were found.
 */
FCS.prototype.get = function(segment, ...keys) {
  let theSegment = this[segment];
  if (!keys.length) return theSegment;

  let firstMatchingKey = keys.find((key) => theSegment[key]);
  return firstMatchingKey ?
    theSegment[firstMatchingKey] :
    null;
};

/**
 * If no arguments are provided, returns *all* the ANALYSIS segment (may be {})
 * Otherwise, returns a single value from the ANALYSIS segment.
 *    e.g.   analysis('GATE1 count') ->  '1234'
 * @param keys     varargs, returns first "hit"
 * @returns       {} if no-arg, else String, null if none were found.
 */
FCS.prototype.getAnalysis = function(...keys) {
  return this.get(FCS.SEGMENT.HEADER, ...keys);
};

/**
 * If no arguments are provided, returns *all* the TEXT segment.
 *Otherwise, returns a single value from the TEXT segment.
 *    e.g.   getText('$CYT') ->  'FACSort'
 * @param keys     varargs,  returns first "hit"
 * @returns       {} if no-arg, else String, null if none were found.
 */
FCS.prototype.getText = function(...keys) {
  return this.get(FCS.SEGMENT.TEXT, ...keys);
};

/**
 * Returns an entire array of values from the text segment,
 * The returned array has 1 based indexing
 *    e.g.   get$PnX('N') => [,'FSC-H','SSC-H','FL1-H', etc...]
 * @param x
 * @returns {Array}
 */
FCS.prototype.get$PnX = function(x) {
  let result = [];
  result[0] = null;
  for (let p = 1; p <= this.meta.$PAR; p++)
    result[p] = this.text["$P" + p + x];

  return result;
};

/**
 * Returns numeric data if it was collected   (i.e. meta.dataFormat was asNumber or asBoth)
 * Whether this is the event[idx] or the parameter[idx] depends on meta.groupBy.
 * @param idx   1-based.
 * @returns {[]} of Numbers
 */
FCS.prototype.getNumericData = function(idx) {
  return (this.dataAsNumbers) ?
    this.dataAsNumbers[idx - 1] :
    null;
};

/**
 * Returns string data if it was collected   (i.e. meta.dataFormat was asString or asBoth)
 * Whether this is the event[idx] or the parameter[idx] depends on meta.groupBy.
 * @param idx   1-based.
 * @returns {[]}  of Strings
 */
FCS.prototype.getStringData = function(idx) {
  return (this.dataAsStrings) ?
    this.dataAsStrings[idx - 1] :
    null;
};

/**
 * Return an shallow copy object of a smallish subset of us
 * @param onlys[]   dot delimited Strings, e.g. 'meta' to get all of meta, 'text.$P1N' to get parameter 1 name
 * @returns {{}}    will be empty if onlys is empty
 */
FCS.prototype.getOnly = function(onlys) {
  // if only one, force to an array...
  if (!Array.isArray(onlys)) onlys = [onlys];
  let result = {};
  for (let i = 0; i < onlys.length; i++) {
    let s = onlys[i].split(".", 2); // we only go 1 or 2 deep
    let s0 = s[0];
    if (s.length === 1) {
      // copy everything
      result[s0] = this[s0];
    } else {
      if (!result[s0]) result[s0] = {};
      result[s0][s[1]] = this[s0][s[1]];
    }
  }

  return result;
};

/**
 * Read asynchronously, using an FCSWriteableStream.
 * @param readStream   required
 * @param moreOptions  optional
 * @param callback     if present, callback(err, fcs) gets called at the end.
 */
FCS.prototype.readStreamAsync = function(readStream, moreOptions, callback) {
  let self = this;
  let fws = this.prepareWriteableStream(callback, readStream);
  this.options(moreOptions);

  readStream.pipe(fws);
};

/**
 * Prepares a writeableStream for use with this FCS
 * if a callback is provided, all you need do is readableStream.pipe(fws);
 *
 * @param callback         if present, it will get called back with (err, fcs)
 * @param readableStream   if present, may get closed sooner...
 * @returns {FCSWriteStream}
 */
FCS.prototype.prepareWriteableStream = function(callback, readableStream) {
  let fws = new FCSWriteStream(this, readableStream);
  if (callback) {
    fws.on("finish", function(err) {
      callback(err, fws.fcs); // access the underlying fcs via  fws.getFCS()
    });
    fws.on("error", function(err) {
      callback(err, fws.fcs);
    });
  }

  return fws;
};

// here follow private methods

/**
 * Decides various parameters and methods based upon our options
 * @param databuf
 * @returns {{asNumber: boolean, asString: boolean, decimalsToPrint: number, bigSkip: number}}
 * @private
 */
FCS.prototype._prepareReadParameters = function(databuf) {
  let isBE;
  if (this.text.$BYTEORD.includes("2,1")) isBE = true;
  else if (this.text.$BYTEORD.includes("1,2")) isBE = false;
  else throw Error("cannot handle $BYTEORD= " + this.text.$BYTEORD);

  let options = this.meta;

  let readParameters = {
    asNumber:
      FCS.OPTION_VALUES.asNumber === options.dataFormat ||
      FCS.OPTION_VALUES.asBoth === options.dataFormat,
    asString:
      FCS.OPTION_VALUES.asString === options.dataFormat ||
      FCS.OPTION_VALUES.asBoth === options.dataFormat,
    decimalsToPrint: Number(
      options.decimalsToPrint || FCS.DEFAULT_VALUES.decimalsToPrint
    ),
    bigSkip: 0,
  };

  readParameters.eventsToRead = Number(
    options.eventsToRead || FCS.DEFAULT_VALUES.eventsToRead
  );
  if (
    readParameters.eventsToRead <= 0 ||
    readParameters.eventsToRead > this.meta.eventCount
  )
    readParameters.eventsToRead = this.meta.eventCount;

  switch (this.text.$DATATYPE) {
    case "D":
      readParameters.fn = isBE ? databuf.readDoubleBE : databuf.readDoubleLE;
      readParameters.bytes = 8;
      break;
    case "F":
      readParameters.fn = isBE ? databuf.readFloatBE : databuf.readFloatLE;
      readParameters.bytes = 4;
      break;
    case "I":
      let bits = Number(this.text.$P1B);
      if (bits > 16) {
        readParameters.fn = isBE ? databuf.readUInt32BE : databuf.readUInt32LE;
        readParameters.bytes = 4;
      } else {
        readParameters.fn = isBE ? databuf.readUInt16BE : databuf.readUInt16LE;
        readParameters.bytes = 2;
      }
      break;
    default:
      throw Error("oops");
  }

  readParameters.bytesPerEvent = readParameters.bytes * this.meta.$PAR;

  options.skip = options.skip || options.eventSkip; // fix bug#4
  if (options.skip && readParameters.eventsToRead < this.meta.eventCount) {
    let events2Skip;
    if (Number.isFinite(options.skip)) events2Skip = options.skip;
    else {
      // FIXME, doesn't actually work
      events2Skip =
        Math.floor(this.meta.eventCount / readParameters.eventsToRead) - 2;
      this.meta.computedSkip = options.skip + " -> " + events2Skip;
    }
    readParameters.bigSkip = events2Skip * readParameters.bytesPerEvent;
  }

  return readParameters;
};

/**
 * Read data and group 1st by event (the natural order in the file)
 *
 * @param databuf  required
 * @param readParameters  optional
 * @returns {FCS}  for convenience
 */
FCS.prototype._readDataGroupByEvent = function(databuf, readParameters) {

  // determine if these are ints, floats, etc...
  readParameters = readParameters || this._prepareReadParameters(databuf);

  let offset = Number(this.header.beginData);

  // local cache since heavily used
  let bytesPerMeasurement = readParameters.bytes;
  let databufReadFn = readParameters.fn;
  let eventsToRead = readParameters.eventsToRead;
  let numParams = Number(this.meta.$PAR);
  let decimalsToPrint =
    "I" === this.text.$DATATYPE ? -1 : readParameters.decimalsToPrint;

  let e = Number;
  let p = Number;
  let v = Number;

  let dataNumbers;
  if (readParameters.asNumber) {
    dataNumbers = new Array(eventsToRead);
    for (e = 0; e < eventsToRead; e++) dataNumbers[e] = new Array(numParams);
  }

  let dataStrings = readParameters.asString ? new Array(eventsToRead) : null;
  let eventString;

  // loop over each event
  for (e = 0; e < eventsToRead; e++) {
    if (dataStrings) {
      eventString = "[";
    }
    let dataE = dataNumbers ? dataNumbers[e] : null; // efficiency

    // loop over each parameter
    for (p = 0; p < numParams; p++) {
      v = databufReadFn.call(databuf, offset);
      offset += bytesPerMeasurement;

      if (dataStrings) {
        if (p > 0) eventString += ",";
        if (decimalsToPrint >= 0) eventString += v.toFixed(decimalsToPrint);
        else eventString += v;
      }

      if (dataE) dataE[p] = v;
    }

    if (dataStrings) {
      eventString += "]";
      dataStrings[e] = eventString;
    }

    offset += readParameters.bigSkip;
  }

  this.dataAsNumbers = dataNumbers;
  this.dataAsStrings = dataStrings;
  return this;
};

/**
 * Read data and group 1st by parameter
 *
 * @param databuf   required
 * @param readParameters   optional
 * @returns {FCS}   for convenience
 */
FCS.prototype._readDataGroupByParam = function(databuf, readParameters) {

  readParameters = readParameters || this._prepareReadParameters(databuf);

  let offset = Number(this.header.beginData);

  // local cache since heavily used
  let bytesPerMeasurement = readParameters.bytes;
  let databufReadFn = readParameters.fn;
  let eventsToRead = readParameters.eventsToRead;
  let numParams = Number(this.meta.$PAR);
  let decimalsToPrint =
    "I" === this.text.$DATATYPE ? -1 : readParameters.decimalsToPrint;

    let maxPerLine = Number(
    this.meta.maxPerLine || FCS.DEFAULT_VALUES.maxPerLine
  );

  let e = Number;
  let p = Number;
  let v = Number;

  let dataArray;
  if (readParameters.asNumber) {
    dataArray = new Array(eventsToRead);
    for (e = 0; e < eventsToRead; e++) dataArray[e] = new Array(numParams);
  }
  let dataStrings;
  if (readParameters.asString) {
    dataStrings = [];
    for (p = 0; p < numParams; p++) dataStrings[p] = "[";
  }

  for (e = 0; e < eventsToRead; e++) {
    for (p = 0; p < numParams; p++) {
      v = databufReadFn.call(databuf, offset);
      offset += bytesPerMeasurement;
      if (dataArray) dataArray[p][e] = v;
      if (dataStrings) {
        if (e > 0) {
          dataStrings[p] += ",";
          if (e % maxPerLine === 0) dataStrings[p] += "\n";
        }

        if (decimalsToPrint >= 0) dataStrings[p] += v.toFixed(decimalsToPrint);
        else dataStrings[p] += v;
      }
    }

    offset += readParameters.bigSkip;
  }

  if (dataStrings) {
    for (p = 0; p < numParams; p++) {
      dataStrings[p] =
        dataStrings[p].substring(0, dataStrings[p].length - 1) + "]";
    }
  }

  this.dataAsNumbers = dataArray;
  this.dataAsStrings = dataStrings;

  return this;
};

/**
 * Read the header segment (the first 256 bytes)
 *
 * @param databuf   required
 * @param encoding  usually absent, defaults to utf8
 * @returns {} (see header variable for details)
 * @private
 */
FCS.prototype._readHeader = function(databuf, encoding = "utf8") {

  let fcsVersion = databuf.toString(encoding, 0, 6);
  if ("FCS" !== fcsVersion.substring(0, 3)) {
    throw Error("Bad FCS Version: " + fcsVersion);
  }

  let header = {
    FCSVersion: fcsVersion,
    beginText: Number(databuf.toString(encoding, 10, 18).trim()),
    endText: Number(databuf.toString(encoding, 18, 26).trim()),
    beginData: Number(databuf.toString(encoding, 26, 34).trim()),
    endData: Number(databuf.toString(encoding, 34, 42).trim()),
    beginAnalysis: Number(databuf.toString(encoding, 42, 50).trim()),
    endAnalysis: Number(databuf.toString(encoding, 50, 58).trim()),
  };

  return header;
};

/**
 * Reads the delimited key/value pairs of a TEXT or ANALYSIS segment
 * @param string   if falsy returns empty object
 * @returns {{}}
 */
FCS.prototype._readTextOrAnalysis = function(string) {
  let result = {};

  if (!string) return result;

  let delim = string.charAt(0);

  if ("<" === delim) {
    // Millipore puts in ANALYSIS as XML, don't try to split it up  (TODO use xml2js)
    result.asXML = string;
    return result;
  }

  // test for escaped delimiters
  let delim2 = delim + delim;
  let needToHandleEscapees = string.indexOf(delim2) > 0;
  let splits = string.split(delim);

  // messy code...
  if (needToHandleEscapees) {
    let corrected = ["", ""];
    let ic = 0;
    let delimCount = 0;
    for (let is = 1; is < splits.length; is++) {
      let s = splits[is];
      if (s) {
        if (delimCount) {
          while (delimCount > 0) {
            corrected[ic] += delim;
            delimCount -= 2; //  a '////' will give 3 blanks but only two // are desired
          }

          if (delimCount === 0)
            // odd number is poorly defined, let's make do...
            corrected[++ic] = s;
          else corrected[ic] += s;
          delimCount = 0;
        } else corrected[++ic] = s;
      } else {
        delimCount++;
      }
    }

    splits = corrected;
  }

  // If string ended with the delimiter, there's an extra empty value.  Remove it.
  let slenminus1 = splits.length - 1;
  if (!splits[slenminus1]) splits.length = slenminus1;

  // Grab all the key/value pairs.  Start at 1 cause split also added a blank field at the beginning
  for (let i = 1; i < splits.length; i += 2) {
    let key = splits[i].trim(); // Partec puts \n before analysis keywords
    let value = splits[i + 1];
    result[key] = value;
  }

  return result;
};

FCS.prototype._readData = function(databuf, readParameters) {
  if (
    "H" === this.text.$MODE ||
    FCS.OPTION_VALUES.asNone === this.meta.dataFormat
  )
    return this;

  readParameters = readParameters || this._prepareReadParameters(databuf);

  if (FCS.OPTION_VALUES.byParam === this.meta.groupBy)
    this._readDataGroupByParam(databuf, readParameters);
  else this._readDataGroupByEvent(databuf, readParameters);

  return this;
};

/**
 * FCS 3.0 added support for huge files, where the actual DATA segment may be described in the TEXT segment
 * Also sets meta.eventCount and meta.$PAR since they are used so often
 *
 * @param inText
 * @private
 */
FCS.prototype._adjustHeaderBasedUponText = function(inText) {
  inText = inText || this.text;

  // update a few important meta.
  this.meta.eventCount = Number(inText.$TOT);
  this.meta.$PAR = Number(inText.$PAR);

  // possibly adjust data and analysis headers for huge files
  if (this.header.beginData === 0) {
    this.header.beginData = Number(inText.$BEGINDATA);
    this.header.endData = Number(inText.$ENDDATA);
  }
  if (this.header.beginAnalysis === 0) {
    this.header.beginAnalysis = Number(inText.$BEGINANALYSIS || 0);
    this.header.endAnalysis = Number(inText.$ENDANALYSIS || 0);
  }
};

module.exports = FCS;
