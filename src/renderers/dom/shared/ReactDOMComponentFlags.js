/**
 * Copyright 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactDOMComponentFlags
 */

'use strict';

// ReactDOMComponent标识
var ReactDOMComponentFlags = {
  hasCachedChildNodes: 1 << 0, // 子节点是否已缓存
};

module.exports = ReactDOMComponentFlags;
