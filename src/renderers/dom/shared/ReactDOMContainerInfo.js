/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactDOMContainerInfo
 */

'use strict';
// ReactDOMContainerInfo模块构建外层非react绘制dom节点的信息，为内层ReactDomComponent组件实例提供namespaceURI及_ancestorInfo。

var validateDOMNesting = require('validateDOMNesting');

var DOC_NODE_TYPE = 9; // Document节点

// 外层非react绘制dom节点的信息，用于向内层ReactDomComponent组件实例提供namespaceURI及_ancestorInfo  
// 前者构成react绘制dom节点的命名空间、后者用于校验节点书写是否符合html规范  
// 该containerInfo对象由ReactMount模块传递给ReactCompositeComponent组件，后者传递给eactDomComponent组件
function ReactDOMContainerInfo(topLevelWrapper, node) {
  var info = {
    _topLevelWrapper: topLevelWrapper,
    _idCounter: 1,
    _ownerDocument: node
      ? node.nodeType === DOC_NODE_TYPE ? node : node.ownerDocument
      : null,
    _node: node,
    _tag: node ? node.nodeName.toLowerCase() : null,
    _namespaceURI: node ? node.namespaceURI : null,
  };
  if (__DEV__) {
    // 用于更新ReactDomComponent组件实例的this._ancestorInfo，以校验嵌套节点书写是否符合html规范
    info._ancestorInfo = node
      ? validateDOMNesting.updatedAncestorInfo(null, info._tag, null)
      : null;
  }
  return info;
}

module.exports = ReactDOMContainerInfo;
