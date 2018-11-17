/**
 * @author Morgan Conrad
 * Copyright(c) 2018
 * This software is released under the MIT license  (http://opensource.org/licenses/MIT)
 *
 * Helper class for FCS to provide a WriteableStream  for typical usage, see FCS.getWriteabletream
 *
 */

const stream = require("stream");
const util = require("util");
const FCS = require("./fcs");

/**
 * Constructor
 * @param fcs             optional, if null, a new one with default options is created
 * @param readableStream  optional, if provided, it will get unpiped as soon as possible
 * @constructor
 */
function FCSWriteStream(fcs, readableStream) {
  stream.Writable.call(this, {
    highWaterMark: 262144,
    decodeStrings: true,
    objectMode: true,
  });

  this.fcs = fcs || new FCS();
  this.readableStream = readableStream; // may be null

  this.bytesRead = 0;

  // lots of state variables while reading
  this._w = {
    state: "header",
    eventsNeeded:
      "asNone" === fcs.meta.dataFormat
        ? 0
        : fcs.meta.eventsToRead || FCS.DEFAULT_VALUES.eventsToRead,
    isAnalysisThere: false,
    isAnalysisSegmentBeforeData: false,
    chunks: [],
    bytesNeeded: 256,
    readParameters: {},
    encoding: fcs.meta.encoding || "utf8",

    prepareForData: function(buffer) {
      this.state = "data";
      this.readParameters = fcs._prepareReadParameters(buffer);
      return (
        this.eventsNeeded *
          (this.readParameters.bigSkip + this.readParameters.bytesPerEvent) +
        fcs.header.beginData
      );
    },
  };
}

util.inherits(FCSWriteStream, stream.Writable);

FCSWriteStream.prototype.getFCS = function() {
  return this.fcs;
};

FCSWriteStream.prototype._write = function(chunk, inEncodingIgnored, callback) {
  let fcs = this.fcs;
  let fws = this;
  let err = null;
  let string;

  let _w = this._w; // save typing...

  if ("done" !== this._w.state) {
    _w.chunks.push(chunk);
    this.bytesRead += chunk.length;
  }

  // may do multiple steps at once, hence while
  while ("done" !== _w.state && this.bytesRead >= _w.bytesNeeded) {
    let buffer = Buffer.concat(_w.chunks);
    _w.chunks = [buffer];

    switch (_w.state) {
      case "header":
        fcs.header = fcs._readHeader(buffer);
        _w.bytesNeeded = fcs.header.endText;
        _w.state = "text";
        break;

      case "text":
        string = buffer.toString(
          _w.encoding,
          fcs.header.beginText,
          fcs.header.endText
        );
        fcs.text = fcs._readTextOrAnalysis(string);
        fcs._adjustHeaderBasedUponText(fcs.text);

        // look at TEXT to figure out what next
        _w.isAnalysisThere = fcs.header.beginAnalysis > 0;
        _w.isAnalysisSegmentBeforeData =
          _w.isAnalysisThere && fcs.header.beginAnalysis < fcs.header.beginData;

        if (_w.isAnalysisSegmentBeforeData) {
          _w.state = "analysis";
          _w.bytesNeeded = fcs.header.endAnalysis;
        } else if (_w.eventsNeeded > 0) {
          _w.bytesNeeded = _w.prepareForData(buffer);
        } else {
          _w.state = "done";
        }
        break;

      case "analysis":
        string = buffer.toString(
          _w.encoding,
          fcs.header.beginAnalysis,
          fcs.header.endAnalysis
        );
        fcs.analysis = fcs._readTextOrAnalysis(string);

        if (_w.isAnalysisSegmentBeforeData && _w.eventsNeeded > 0) {
          _w.bytesNeeded = _w.prepareForData(buffer);
        } else {
          _w.state = "done";
        }
        break;

      case "data":
        fcs._readData(buffer, _w.readParameters);

        if (_w.isAnalysisThere && !_w.isAnalysisSegmentBeforeData) {
          _w.state = "analysis";
          _w.bytesNeeded = fcs.header.endAnalysis;
        } else {
          _w.state = "done";
        }
        break;

      default: throw Error("oops");
    }
  } // end of while loop

  if ("done" !== _w.state) callback(err);
  else {
    if (this.readableStream) {
      this.readableStream.unpipe(this);
      this.emit("finish");
    } else callback(); // can't turn off the spigot, keep reading
  }
};

module.exports = FCSWriteStream;
