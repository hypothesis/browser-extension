/**
 * Activate the extension on the tab sending the message.
 *
 * The extension can optionally redirect the tab to a new URL first, and can
 * also configure the client to focus on a specific annotation or group.
 */
export type ActivateMessage = {
  type: 'activate';

  /** URL to navigate tab to, before activating extension. */
  url?: string;

  /**
   * Fragment indicating the annotations or groups that the client should
   * focus on after loading.
   *
   * The format of this is the same as the `#annotations:` and related fragments
   * understood by the client.
   */
  query?: string;
};

/**
 * Query whether the extension is installed and what features it supports.
 */
export type PingMessage = {
  type: 'ping';

  /**
   * List of features to test for.
   *
   * If a feature is supported, it will be present in a `features` array
   * in the response. Note this field is missing from the response of older
   * extension versions.
   */
  queryFeatures?: string[];
};

/**
 * Type of a request sent to the extension from an external website,
 * such as the bouncer (hyp.is) service.
 */
export type ExternalMessage = PingMessage | ActivateMessage;
