/**
 * Built-in Type Documentation URLs
 *
 * Maps built-in types to their official documentation URLs for
 * Python (docs.python.org), JavaScript (MDN), and TypeScript.
 */

// Base URLs for documentation sites
const PYTHON_DOCS = "https://docs.python.org/3/library";
const MDN_JS = "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects";
const MDN_API = "https://developer.mozilla.org/en-US/docs/Web/API";
const TS_DOCS = "https://www.typescriptlang.org/docs/handbook/utility-types.html";

/**
 * Python built-in types mapped to their documentation URLs
 */
export const PYTHON_BUILTIN_TYPES: Record<string, string> = {
  // Basic types
  str: `${PYTHON_DOCS}/stdtypes.html#str`,
  int: `${PYTHON_DOCS}/functions.html#int`,
  float: `${PYTHON_DOCS}/functions.html#float`,
  bool: `${PYTHON_DOCS}/functions.html#bool`,
  bytes: `${PYTHON_DOCS}/stdtypes.html#bytes`,
  bytearray: `${PYTHON_DOCS}/stdtypes.html#bytearray`,
  list: `${PYTHON_DOCS}/stdtypes.html#list`,
  dict: `${PYTHON_DOCS}/stdtypes.html#dict`,
  set: `${PYTHON_DOCS}/stdtypes.html#set`,
  frozenset: `${PYTHON_DOCS}/stdtypes.html#frozenset`,
  tuple: `${PYTHON_DOCS}/stdtypes.html#tuple`,
  object: `${PYTHON_DOCS}/functions.html#object`,
  type: `${PYTHON_DOCS}/functions.html#type`,
  property: `${PYTHON_DOCS}/functions.html#property`,
  classmethod: `${PYTHON_DOCS}/functions.html#classmethod`,
  staticmethod: `${PYTHON_DOCS}/functions.html#staticmethod`,
  super: `${PYTHON_DOCS}/functions.html#super`,

  // Typing module
  Any: `${PYTHON_DOCS}/typing.html#typing.Any`,
  Optional: `${PYTHON_DOCS}/typing.html#typing.Optional`,
  Union: `${PYTHON_DOCS}/typing.html#typing.Union`,
  Callable: `${PYTHON_DOCS}/typing.html#typing.Callable`,
  Sequence: `${PYTHON_DOCS}/typing.html#typing.Sequence`,
  Mapping: `${PYTHON_DOCS}/typing.html#typing.Mapping`,
  MutableMapping: `${PYTHON_DOCS}/typing.html#typing.MutableMapping`,
  Iterable: `${PYTHON_DOCS}/typing.html#typing.Iterable`,
  Iterator: `${PYTHON_DOCS}/typing.html#typing.Iterator`,
  Generator: `${PYTHON_DOCS}/typing.html#typing.Generator`,
  AsyncGenerator: `${PYTHON_DOCS}/typing.html#typing.AsyncGenerator`,
  AsyncIterable: `${PYTHON_DOCS}/typing.html#typing.AsyncIterable`,
  AsyncIterator: `${PYTHON_DOCS}/typing.html#typing.AsyncIterator`,
  Awaitable: `${PYTHON_DOCS}/typing.html#typing.Awaitable`,
  Coroutine: `${PYTHON_DOCS}/typing.html#typing.Coroutine`,
  TypeVar: `${PYTHON_DOCS}/typing.html#typing.TypeVar`,
  Generic: `${PYTHON_DOCS}/typing.html#typing.Generic`,
  Protocol: `${PYTHON_DOCS}/typing.html#typing.Protocol`,
  TypedDict: `${PYTHON_DOCS}/typing.html#typing.TypedDict`,
  Literal: `${PYTHON_DOCS}/typing.html#typing.Literal`,
  Final: `${PYTHON_DOCS}/typing.html#typing.Final`,
  ClassVar: `${PYTHON_DOCS}/typing.html#typing.ClassVar`,
  Annotated: `${PYTHON_DOCS}/typing.html#typing.Annotated`,
  Self: `${PYTHON_DOCS}/typing.html#typing.Self`,
  ParamSpec: `${PYTHON_DOCS}/typing.html#typing.ParamSpec`,
  TypeAlias: `${PYTHON_DOCS}/typing.html#typing.TypeAlias`,
  NoReturn: `${PYTHON_DOCS}/typing.html#typing.NoReturn`,
  Never: `${PYTHON_DOCS}/typing.html#typing.Never`,
  List: `${PYTHON_DOCS}/typing.html#typing.List`,
  Dict: `${PYTHON_DOCS}/typing.html#typing.Dict`,
  Set: `${PYTHON_DOCS}/typing.html#typing.Set`,
  Tuple: `${PYTHON_DOCS}/typing.html#typing.Tuple`,
  Type: `${PYTHON_DOCS}/typing.html#typing.Type`,
  TextIO: `${PYTHON_DOCS}/typing.html#typing.TextIO`,
  BinaryIO: `${PYTHON_DOCS}/typing.html#typing.BinaryIO`,

  // Collections
  OrderedDict: `${PYTHON_DOCS}/collections.html#collections.OrderedDict`,
  Counter: `${PYTHON_DOCS}/collections.html#collections.Counter`,
  ChainMap: `${PYTHON_DOCS}/collections.html#collections.ChainMap`,

  // Datetime
  datetime: `${PYTHON_DOCS}/datetime.html#datetime.datetime`,
  date: `${PYTHON_DOCS}/datetime.html#datetime.date`,
  time: `${PYTHON_DOCS}/datetime.html#datetime.time`,
  timedelta: `${PYTHON_DOCS}/datetime.html#datetime.timedelta`,
  timezone: `${PYTHON_DOCS}/datetime.html#datetime.timezone`,

  // Pathlib
  Path: `${PYTHON_DOCS}/pathlib.html#pathlib.Path`,
  PurePath: `${PYTHON_DOCS}/pathlib.html#pathlib.PurePath`,
  PosixPath: `${PYTHON_DOCS}/pathlib.html#pathlib.PosixPath`,
  WindowsPath: `${PYTHON_DOCS}/pathlib.html#pathlib.WindowsPath`,

  // IO
  BytesIO: `${PYTHON_DOCS}/io.html#io.BytesIO`,
  StringIO: `${PYTHON_DOCS}/io.html#io.StringIO`,

  // ABC
  ABC: `${PYTHON_DOCS}/abc.html#abc.ABC`,
  ABCMeta: `${PYTHON_DOCS}/abc.html#abc.ABCMeta`,

  // Exceptions
  Exception: `${PYTHON_DOCS}/exceptions.html#Exception`,
  BaseException: `${PYTHON_DOCS}/exceptions.html#BaseException`,
  ValueError: `${PYTHON_DOCS}/exceptions.html#ValueError`,
  TypeError: `${PYTHON_DOCS}/exceptions.html#TypeError`,
  KeyError: `${PYTHON_DOCS}/exceptions.html#KeyError`,
  RuntimeError: `${PYTHON_DOCS}/exceptions.html#RuntimeError`,
  StopIteration: `${PYTHON_DOCS}/exceptions.html#StopIteration`,

  // Contextlib
  AbstractContextManager: `${PYTHON_DOCS}/contextlib.html#contextlib.AbstractContextManager`,
  AbstractAsyncContextManager: `${PYTHON_DOCS}/contextlib.html#contextlib.AbstractAsyncContextManager`,

  // Enum
  Enum: `${PYTHON_DOCS}/enum.html#enum.Enum`,
  IntEnum: `${PYTHON_DOCS}/enum.html#enum.IntEnum`,
  StrEnum: `${PYTHON_DOCS}/enum.html#enum.StrEnum`,
  Flag: `${PYTHON_DOCS}/enum.html#enum.Flag`,

  // UUID
  UUID: `${PYTHON_DOCS}/uuid.html#uuid.UUID`,

  // Re
  Pattern: `${PYTHON_DOCS}/re.html#re.Pattern`,
  Match: `${PYTHON_DOCS}/re.html#re.Match`,

  // Dataclasses
  Field: `${PYTHON_DOCS}/dataclasses.html#dataclasses.Field`,
};

/**
 * JavaScript/TypeScript built-in types mapped to their documentation URLs
 */
export const JS_BUILTIN_TYPES: Record<string, string> = {
  // Primitive wrappers
  String: `${MDN_JS}/String`,
  Number: `${MDN_JS}/Number`,
  Boolean: `${MDN_JS}/Boolean`,
  BigInt: `${MDN_JS}/BigInt`,
  Symbol: `${MDN_JS}/Symbol`,

  // Objects
  Object: `${MDN_JS}/Object`,
  Function: `${MDN_JS}/Function`,
  Array: `${MDN_JS}/Array`,
  Date: `${MDN_JS}/Date`,
  RegExp: `${MDN_JS}/RegExp`,
  Error: `${MDN_JS}/Error`,
  TypeError: `${MDN_JS}/TypeError`,
  RangeError: `${MDN_JS}/RangeError`,
  SyntaxError: `${MDN_JS}/SyntaxError`,
  ReferenceError: `${MDN_JS}/ReferenceError`,

  // Collections
  Map: `${MDN_JS}/Map`,
  Set: `${MDN_JS}/Set`,
  WeakMap: `${MDN_JS}/WeakMap`,
  WeakSet: `${MDN_JS}/WeakSet`,
  WeakRef: `${MDN_JS}/WeakRef`,

  // Async
  Promise: `${MDN_JS}/Promise`,
  AsyncFunction: `${MDN_JS}/AsyncFunction`,
  AsyncGenerator: `${MDN_JS}/AsyncGenerator`,
  AsyncIterator: `${MDN_JS}/AsyncIterator`,

  // TypedArrays
  ArrayBuffer: `${MDN_JS}/ArrayBuffer`,
  SharedArrayBuffer: `${MDN_JS}/SharedArrayBuffer`,
  DataView: `${MDN_JS}/DataView`,
  Int8Array: `${MDN_JS}/Int8Array`,
  Uint8Array: `${MDN_JS}/Uint8Array`,
  Int16Array: `${MDN_JS}/Int16Array`,
  Uint16Array: `${MDN_JS}/Uint16Array`,
  Int32Array: `${MDN_JS}/Int32Array`,
  Uint32Array: `${MDN_JS}/Uint32Array`,
  Float32Array: `${MDN_JS}/Float32Array`,
  Float64Array: `${MDN_JS}/Float64Array`,
  BigInt64Array: `${MDN_JS}/BigInt64Array`,
  BigUint64Array: `${MDN_JS}/BigUint64Array`,

  // Iteration
  Iterator: `${MDN_JS}/Iterator`,
  Generator: `${MDN_JS}/Generator`,

  // Intl
  Intl: `${MDN_JS}/Intl`,

  // Other
  JSON: `${MDN_JS}/JSON`,
  Math: `${MDN_JS}/Math`,
  Reflect: `${MDN_JS}/Reflect`,
  Proxy: `${MDN_JS}/Proxy`,

  // Web APIs
  URL: `${MDN_API}/URL`,
  URLSearchParams: `${MDN_API}/URLSearchParams`,
  FormData: `${MDN_API}/FormData`,
  Blob: `${MDN_API}/Blob`,
  File: `${MDN_API}/File`,
  Headers: `${MDN_API}/Headers`,
  Request: `${MDN_API}/Request`,
  Response: `${MDN_API}/Response`,
  ReadableStream: `${MDN_API}/ReadableStream`,
  WritableStream: `${MDN_API}/WritableStream`,
  AbortController: `${MDN_API}/AbortController`,
  AbortSignal: `${MDN_API}/AbortSignal`,

  // TypeScript utility types
  Record: `${TS_DOCS}#recordkeys-type`,
  Partial: `${TS_DOCS}#partialtype`,
  Required: `${TS_DOCS}#requiredtype`,
  Readonly: `${TS_DOCS}#readonlytype`,
  Pick: `${TS_DOCS}#picktype-keys`,
  Omit: `${TS_DOCS}#omittype-keys`,
  Exclude: `${TS_DOCS}#excludeuniontype-excludedmembers`,
  Extract: `${TS_DOCS}#extracttype-union`,
  NonNullable: `${TS_DOCS}#nonnullabletype`,
  ReturnType: `${TS_DOCS}#returntypetype`,
  Parameters: `${TS_DOCS}#parameterstype`,
  ConstructorParameters: `${TS_DOCS}#constructorparameterstype`,
  InstanceType: `${TS_DOCS}#instancetypetype`,
  Awaited: `${TS_DOCS}#awaitedtype`,
};

/**
 * Get external documentation URL for a built-in type
 *
 * NOTE: We use Object.hasOwn() to check for key existence to avoid
 * accidentally returning prototype properties like "constructor" or "toString"
 * which would return functions instead of strings.
 */
export function getBuiltinTypeDocUrl(
  typeName: string,
  language: "python" | "typescript" | "javascript"
): string | null {
  if (language === "python") {
    return Object.hasOwn(PYTHON_BUILTIN_TYPES, typeName)
      ? PYTHON_BUILTIN_TYPES[typeName]
      : null;
  }
  return Object.hasOwn(JS_BUILTIN_TYPES, typeName)
    ? JS_BUILTIN_TYPES[typeName]
    : null;
}
