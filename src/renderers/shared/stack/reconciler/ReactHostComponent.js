/**
 * Copyright 2014-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactHostComponent
 */

'use strict';

var invariant = require('invariant');

var genericComponentClass = null;
var textComponentClass = null;

var ReactHostComponentInjection = {
  // This accepts a class that receives the tag string. This is a catch all
  // that can render any kind of tag.
  // 接收一个参数作为构造函数
  injectGenericComponentClass: function(componentClass) {
    genericComponentClass = componentClass;
  },
  // This accepts a text component class that takes the text string to be
  // rendered as props.
  // 接收生成文本节点的构造函数
  injectTextComponentClass: function(componentClass) {
    textComponentClass = componentClass;
  },
};

/**
 * Get a host internal component class for a specific tag.
 * 生成dom节点
 *
 * @param {ReactElement} element The element to create.
 * @return {function} The internal class constructor function.
 */
function createInternalComponent(element) {
  invariant(
    genericComponentClass,
    'There is no registered component for the tag %s',
    element.type,
  );
  //返回由genericComponentClass构造的节点
  return new genericComponentClass(element);
}

/**
 * 生成文本节点
 * @param {ReactText} text
 * @return {ReactComponent}
 */
function createInstanceForText(text) {
  return new textComponentClass(text);
}

/**
 * 检测是否为文本节点
 * @param {ReactComponent} component
 * @return {boolean}
 */
function isTextComponent(component) {
  return component instanceof textComponentClass;
}

var ReactHostComponent = {
  createInternalComponent: createInternalComponent,
  createInstanceForText: createInstanceForText,
  isTextComponent: isTextComponent,
  injection: ReactHostComponentInjection,
};

module.exports = ReactHostComponent;
