/**
 * Built-in Type Documentation URLs
 *
 * Maps built-in types to their official documentation URLs for
 * Python (docs.python.org), JavaScript (MDN), and TypeScript.
 */

import type { UrlLanguage } from "@/lib/utils/url";

// Base URLs for documentation sites
const PYTHON_DOCS = "https://docs.python.org/3/library";
const MDN_JS = "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects";
const MDN_API = "https://developer.mozilla.org/en-US/docs/Web/API";
const TS_DOCS = "https://www.typescriptlang.org/docs/handbook/utility-types.html";
const JAVA_DOCS = "https://docs.oracle.com/en/java/javase/21/docs/api/java.base";
const GO_DOCS = "https://pkg.go.dev";

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
 * Java built-in types mapped to their documentation URLs
 */
export const JAVA_BUILTIN_TYPES: Record<string, string> = {
  // Primitives and wrappers
  String: `${JAVA_DOCS}/java/lang/String.html`,
  Integer: `${JAVA_DOCS}/java/lang/Integer.html`,
  Long: `${JAVA_DOCS}/java/lang/Long.html`,
  Double: `${JAVA_DOCS}/java/lang/Double.html`,
  Float: `${JAVA_DOCS}/java/lang/Float.html`,
  Boolean: `${JAVA_DOCS}/java/lang/Boolean.html`,
  Byte: `${JAVA_DOCS}/java/lang/Byte.html`,
  Short: `${JAVA_DOCS}/java/lang/Short.html`,
  Character: `${JAVA_DOCS}/java/lang/Character.html`,
  Number: `${JAVA_DOCS}/java/lang/Number.html`,
  Object: `${JAVA_DOCS}/java/lang/Object.html`,
  Class: `${JAVA_DOCS}/java/lang/Class.html`,
  Void: `${JAVA_DOCS}/java/lang/Void.html`,

  // Collections
  List: `${JAVA_DOCS}/java/util/List.html`,
  ArrayList: `${JAVA_DOCS}/java/util/ArrayList.html`,
  LinkedList: `${JAVA_DOCS}/java/util/LinkedList.html`,
  Set: `${JAVA_DOCS}/java/util/Set.html`,
  HashSet: `${JAVA_DOCS}/java/util/HashSet.html`,
  TreeSet: `${JAVA_DOCS}/java/util/TreeSet.html`,
  Map: `${JAVA_DOCS}/java/util/Map.html`,
  HashMap: `${JAVA_DOCS}/java/util/HashMap.html`,
  TreeMap: `${JAVA_DOCS}/java/util/TreeMap.html`,
  LinkedHashMap: `${JAVA_DOCS}/java/util/LinkedHashMap.html`,
  ConcurrentHashMap: `${JAVA_DOCS}/java/util/concurrent/ConcurrentHashMap.html`,
  Queue: `${JAVA_DOCS}/java/util/Queue.html`,
  Deque: `${JAVA_DOCS}/java/util/Deque.html`,
  Stack: `${JAVA_DOCS}/java/util/Stack.html`,
  Vector: `${JAVA_DOCS}/java/util/Vector.html`,
  Collection: `${JAVA_DOCS}/java/util/Collection.html`,
  Iterable: `${JAVA_DOCS}/java/lang/Iterable.html`,
  Iterator: `${JAVA_DOCS}/java/util/Iterator.html`,
  Arrays: `${JAVA_DOCS}/java/util/Arrays.html`,
  Collections: `${JAVA_DOCS}/java/util/Collections.html`,

  // IO/NIO
  InputStream: `${JAVA_DOCS}/java/io/InputStream.html`,
  OutputStream: `${JAVA_DOCS}/java/io/OutputStream.html`,
  Reader: `${JAVA_DOCS}/java/io/Reader.html`,
  Writer: `${JAVA_DOCS}/java/io/Writer.html`,
  File: `${JAVA_DOCS}/java/io/File.html`,
  Path: `${JAVA_DOCS}/java/nio/file/Path.html`,
  Files: `${JAVA_DOCS}/java/nio/file/Files.html`,
  ByteBuffer: `${JAVA_DOCS}/java/nio/ByteBuffer.html`,
  Channel: `${JAVA_DOCS}/java/nio/channels/Channel.html`,
  Serializable: `${JAVA_DOCS}/java/io/Serializable.html`,

  // Functional interfaces
  Function: `${JAVA_DOCS}/java/util/function/Function.html`,
  Consumer: `${JAVA_DOCS}/java/util/function/Consumer.html`,
  Supplier: `${JAVA_DOCS}/java/util/function/Supplier.html`,
  Predicate: `${JAVA_DOCS}/java/util/function/Predicate.html`,
  BiFunction: `${JAVA_DOCS}/java/util/function/BiFunction.html`,
  BiConsumer: `${JAVA_DOCS}/java/util/function/BiConsumer.html`,
  BiPredicate: `${JAVA_DOCS}/java/util/function/BiPredicate.html`,
  UnaryOperator: `${JAVA_DOCS}/java/util/function/UnaryOperator.html`,
  BinaryOperator: `${JAVA_DOCS}/java/util/function/BinaryOperator.html`,
  Runnable: `${JAVA_DOCS}/java/lang/Runnable.html`,
  Callable: `${JAVA_DOCS}/java/util/concurrent/Callable.html`,
  Comparator: `${JAVA_DOCS}/java/util/Comparator.html`,
  Comparable: `${JAVA_DOCS}/java/lang/Comparable.html`,

  // Streams
  Stream: `${JAVA_DOCS}/java/util/stream/Stream.html`,
  IntStream: `${JAVA_DOCS}/java/util/stream/IntStream.html`,
  LongStream: `${JAVA_DOCS}/java/util/stream/LongStream.html`,
  DoubleStream: `${JAVA_DOCS}/java/util/stream/DoubleStream.html`,
  Collectors: `${JAVA_DOCS}/java/util/stream/Collectors.html`,

  // Optional
  Optional: `${JAVA_DOCS}/java/util/Optional.html`,
  OptionalInt: `${JAVA_DOCS}/java/util/OptionalInt.html`,
  OptionalLong: `${JAVA_DOCS}/java/util/OptionalLong.html`,
  OptionalDouble: `${JAVA_DOCS}/java/util/OptionalDouble.html`,

  // Concurrent
  CompletableFuture: `${JAVA_DOCS}/java/util/concurrent/CompletableFuture.html`,
  Future: `${JAVA_DOCS}/java/util/concurrent/Future.html`,
  ExecutorService: `${JAVA_DOCS}/java/util/concurrent/ExecutorService.html`,
  Executor: `${JAVA_DOCS}/java/util/concurrent/Executor.html`,
  ThreadPoolExecutor: `${JAVA_DOCS}/java/util/concurrent/ThreadPoolExecutor.html`,
  ScheduledExecutorService: `${JAVA_DOCS}/java/util/concurrent/ScheduledExecutorService.html`,
  CountDownLatch: `${JAVA_DOCS}/java/util/concurrent/CountDownLatch.html`,
  Semaphore: `${JAVA_DOCS}/java/util/concurrent/Semaphore.html`,
  Lock: `${JAVA_DOCS}/java/util/concurrent/locks/Lock.html`,
  ReentrantLock: `${JAVA_DOCS}/java/util/concurrent/locks/ReentrantLock.html`,
  AtomicInteger: `${JAVA_DOCS}/java/util/concurrent/atomic/AtomicInteger.html`,
  AtomicLong: `${JAVA_DOCS}/java/util/concurrent/atomic/AtomicLong.html`,
  AtomicBoolean: `${JAVA_DOCS}/java/util/concurrent/atomic/AtomicBoolean.html`,
  AtomicReference: `${JAVA_DOCS}/java/util/concurrent/atomic/AtomicReference.html`,

  // Time
  LocalDate: `${JAVA_DOCS}/java/time/LocalDate.html`,
  LocalTime: `${JAVA_DOCS}/java/time/LocalTime.html`,
  LocalDateTime: `${JAVA_DOCS}/java/time/LocalDateTime.html`,
  ZonedDateTime: `${JAVA_DOCS}/java/time/ZonedDateTime.html`,
  Instant: `${JAVA_DOCS}/java/time/Instant.html`,
  Duration: `${JAVA_DOCS}/java/time/Duration.html`,
  Period: `${JAVA_DOCS}/java/time/Period.html`,
  ZoneId: `${JAVA_DOCS}/java/time/ZoneId.html`,
  DateTimeFormatter: `${JAVA_DOCS}/java/time/format/DateTimeFormatter.html`,
  Date: `${JAVA_DOCS}/java/util/Date.html`,
  Calendar: `${JAVA_DOCS}/java/util/Calendar.html`,

  // Exceptions
  Exception: `${JAVA_DOCS}/java/lang/Exception.html`,
  RuntimeException: `${JAVA_DOCS}/java/lang/RuntimeException.html`,
  Error: `${JAVA_DOCS}/java/lang/Error.html`,
  Throwable: `${JAVA_DOCS}/java/lang/Throwable.html`,
  IllegalArgumentException: `${JAVA_DOCS}/java/lang/IllegalArgumentException.html`,
  IllegalStateException: `${JAVA_DOCS}/java/lang/IllegalStateException.html`,
  NullPointerException: `${JAVA_DOCS}/java/lang/NullPointerException.html`,
  IOException: `${JAVA_DOCS}/java/io/IOException.html`,
  InterruptedException: `${JAVA_DOCS}/java/lang/InterruptedException.html`,

  // Annotations
  Override: `${JAVA_DOCS}/java/lang/Override.html`,
  Deprecated: `${JAVA_DOCS}/java/lang/Deprecated.html`,
  SuppressWarnings: `${JAVA_DOCS}/java/lang/SuppressWarnings.html`,
  FunctionalInterface: `${JAVA_DOCS}/java/lang/FunctionalInterface.html`,

  // Other common types
  UUID: `${JAVA_DOCS}/java/util/UUID.html`,
  Pattern: `${JAVA_DOCS}/java/util/regex/Pattern.html`,
  Matcher: `${JAVA_DOCS}/java/util/regex/Matcher.html`,
  StringBuilder: `${JAVA_DOCS}/java/lang/StringBuilder.html`,
  StringBuffer: `${JAVA_DOCS}/java/lang/StringBuffer.html`,
  BigInteger: `${JAVA_DOCS}/java/math/BigInteger.html`,
  BigDecimal: `${JAVA_DOCS}/java/math/BigDecimal.html`,
  URL: `${JAVA_DOCS}/java/net/URL.html`,
  URI: `${JAVA_DOCS}/java/net/URI.html`,
  HttpClient: `${JAVA_DOCS}/java/net/http/HttpClient.html`,
  HttpRequest: `${JAVA_DOCS}/java/net/http/HttpRequest.html`,
  HttpResponse: `${JAVA_DOCS}/java/net/http/HttpResponse.html`,

  // Record/Sealed (Java 16+)
  Record: `${JAVA_DOCS}/java/lang/Record.html`,
};

/**
 * Go built-in types mapped to their documentation URLs
 */
export const GO_BUILTIN_TYPES: Record<string, string> = {
  // Primitive types
  string: `${GO_DOCS}/builtin#string`,
  int: `${GO_DOCS}/builtin#int`,
  int8: `${GO_DOCS}/builtin#int8`,
  int16: `${GO_DOCS}/builtin#int16`,
  int32: `${GO_DOCS}/builtin#int32`,
  int64: `${GO_DOCS}/builtin#int64`,
  uint: `${GO_DOCS}/builtin#uint`,
  uint8: `${GO_DOCS}/builtin#uint8`,
  uint16: `${GO_DOCS}/builtin#uint16`,
  uint32: `${GO_DOCS}/builtin#uint32`,
  uint64: `${GO_DOCS}/builtin#uint64`,
  uintptr: `${GO_DOCS}/builtin#uintptr`,
  float32: `${GO_DOCS}/builtin#float32`,
  float64: `${GO_DOCS}/builtin#float64`,
  complex64: `${GO_DOCS}/builtin#complex64`,
  complex128: `${GO_DOCS}/builtin#complex128`,
  bool: `${GO_DOCS}/builtin#bool`,
  byte: `${GO_DOCS}/builtin#byte`,
  rune: `${GO_DOCS}/builtin#rune`,
  error: `${GO_DOCS}/builtin#error`,
  any: `${GO_DOCS}/builtin#any`,
  comparable: `${GO_DOCS}/builtin#comparable`,

  // Common standard library types
  Reader: `${GO_DOCS}/io#Reader`,
  Writer: `${GO_DOCS}/io#Writer`,
  Closer: `${GO_DOCS}/io#Closer`,
  ReadWriter: `${GO_DOCS}/io#ReadWriter`,
  ReadCloser: `${GO_DOCS}/io#ReadCloser`,
  WriteCloser: `${GO_DOCS}/io#WriteCloser`,
  ReadWriteCloser: `${GO_DOCS}/io#ReadWriteCloser`,
  Buffer: `${GO_DOCS}/bytes#Buffer`,
  Context: `${GO_DOCS}/context#Context`,
  Time: `${GO_DOCS}/time#Time`,
  Duration: `${GO_DOCS}/time#Duration`,
  Mutex: `${GO_DOCS}/sync#Mutex`,
  RWMutex: `${GO_DOCS}/sync#RWMutex`,
  WaitGroup: `${GO_DOCS}/sync#WaitGroup`,
  Once: `${GO_DOCS}/sync#Once`,
  Cond: `${GO_DOCS}/sync#Cond`,
  Pool: `${GO_DOCS}/sync#Pool`,
  Map: `${GO_DOCS}/sync#Map`,
  URL: `${GO_DOCS}/net/url#URL`,
  Request: `${GO_DOCS}/net/http#Request`,
  Response: `${GO_DOCS}/net/http#Response`,
  ResponseWriter: `${GO_DOCS}/net/http#ResponseWriter`,
  Client: `${GO_DOCS}/net/http#Client`,
  Handler: `${GO_DOCS}/net/http#Handler`,
  HandlerFunc: `${GO_DOCS}/net/http#HandlerFunc`,
  Header: `${GO_DOCS}/net/http#Header`,
  File: `${GO_DOCS}/os#File`,
  Regexp: `${GO_DOCS}/regexp#Regexp`,
  Logger: `${GO_DOCS}/log#Logger`,
  Template: `${GO_DOCS}/text/template#Template`,
  Decoder: `${GO_DOCS}/encoding/json#Decoder`,
  Encoder: `${GO_DOCS}/encoding/json#Encoder`,
  Conn: `${GO_DOCS}/net#Conn`,
  Listener: `${GO_DOCS}/net#Listener`,
  Addr: `${GO_DOCS}/net#Addr`,
  IP: `${GO_DOCS}/net#IP`,
  IPNet: `${GO_DOCS}/net#IPNet`,
  Tx: `${GO_DOCS}/database/sql#Tx`,
  DB: `${GO_DOCS}/database/sql#DB`,
  Rows: `${GO_DOCS}/database/sql#Rows`,
  Row: `${GO_DOCS}/database/sql#Row`,
  Stmt: `${GO_DOCS}/database/sql#Stmt`,
  Value: `${GO_DOCS}/reflect#Value`,
  Type: `${GO_DOCS}/reflect#Type`,
};

/**
 * Get external documentation URL for a built-in type
 *
 * NOTE: We use Object.hasOwn() to check for key existence to avoid
 * accidentally returning prototype properties like "constructor" or "toString"
 * which would return functions instead of strings.
 */
export function getBuiltinTypeDocUrl(typeName: string, language: UrlLanguage): string | null {
  if (language === "java") {
    return Object.hasOwn(JAVA_BUILTIN_TYPES, typeName) ? JAVA_BUILTIN_TYPES[typeName] : null;
  }
  if (language === "go") {
    return Object.hasOwn(GO_BUILTIN_TYPES, typeName) ? GO_BUILTIN_TYPES[typeName] : null;
  }
  if (language === "python") {
    return Object.hasOwn(PYTHON_BUILTIN_TYPES, typeName) ? PYTHON_BUILTIN_TYPES[typeName] : null;
  }
  return Object.hasOwn(JS_BUILTIN_TYPES, typeName) ? JS_BUILTIN_TYPES[typeName] : null;
}
