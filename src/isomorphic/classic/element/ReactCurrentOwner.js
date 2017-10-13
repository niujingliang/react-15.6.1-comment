/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactCurrentOwner
 * @flow
 */

'use strict';

import type {ReactInstance} from 'ReactInstanceType';

/**
 * Keeps track of the current owner.
 * 追踪当前所有者
 *
 * The current owner is the component who should own any components that are
 * currently being constructed.
 * 当前所有者是应该拥有任何组件的组件目前正在建造。
 */
var ReactCurrentOwner = {
  /**
   * @internal
   * @type {ReactComponent}
   */
  current: (null: null | ReactInstance),
};

module.exports = ReactCurrentOwner;
