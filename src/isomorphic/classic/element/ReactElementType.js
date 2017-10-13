/**
 * Copyright 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @providesModule ReactElementType
 */

'use strict';

import type {ReactInstance} from 'ReactInstanceType';

// 定义ReactElement source参数的对象结构
export type Source = {
  fileName: string,
  lineNumber: number,
};

//定义ReactElement的结构
export type ReactElement = {
  $$typeof: any,
  type: any,
  key: any,
  ref: any,
  props: any,
  _owner: ReactInstance,

  _self: ReactElement,
  _shadowChildren: any,
  _source: Source,
};
