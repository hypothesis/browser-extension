export class ExtensionError extends Error {}

export class LocalFileError extends ExtensionError {}

export class NoFileAccessError extends ExtensionError {}

export class RestrictedProtocolError extends ExtensionError {}

export class BlockedSiteError extends ExtensionError {}

export class AlreadyInjectedError extends ExtensionError {}

export class RequestCanceledError extends Error {}

export class BadgeUriError extends Error {}
