/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactChildren
 * ReactChildren模块用于处理props.children。
 * props.children可以是数组(包含数组项为ReactNode数组的情形)或单个reactNode形式，
 */

'use strict';

// PooledClass.addPoolingTo将某构造函数装饰为可存储实例池，getPooled创建实例，release销毁实例数据
var PooledClass = require('PooledClass');
// 组件的实例，组件$$typeof,type,key,ref,props等
var ReactElement = require('ReactElement');

var emptyFunction = require('emptyFunction');
// traverseAllChildren(children,callback,traverseContext)  
// 对children的子孙节点执行callback，并传入参数traverseContext  
// callback中，对children的子孙节点执行traverseContext.func方法 
var traverseAllChildren = require('traverseAllChildren');

var twoArgumentPooler = PooledClass.twoArgumentPooler;
var fourArgumentPooler = PooledClass.fourArgumentPooler;

var userProvidedKeyEscapeRegex = /\/+/g;
function escapeUserProvidedKey(text) {
  return ('' + text).replace(userProvidedKeyEscapeRegex, '$&/');
}

/**
 * PooledClass representing the bookkeeping associated with performing a child
 * traversal. Allows avoiding binding callbacks.
 *
 * 参数forEachFunction为遍历元素时，以元素为参数的待执行函数
 * 参数forEachContext为forEachFunction函数执行时的上下文
 * 使用PooledClass.addPoolingTo将ForEachBookKeeping构造函数封装成可使用getPooled创建实例  
 * 
 * @constructor ForEachBookKeeping
 * @param {!function} forEachFunction Function to perform traversal with.
 * @param {?*} forEachContext Context to perform context with.
 */
function ForEachBookKeeping(forEachFunction, forEachContext) {
  this.func = forEachFunction;
  this.context = forEachContext;
  this.count = 0;
}
ForEachBookKeeping.prototype.destructor = function() {
  this.func = null;
  this.context = null;
  this.count = 0;
};
PooledClass.addPoolingTo(ForEachBookKeeping, twoArgumentPooler);

// 参数bookKeeping为ForEachBookKeeping实例，实例中含有处理元素的执行函数及其上下文
function forEachSingleChild(bookKeeping, child, name) {
  var {func, context} = bookKeeping;
  func.call(context, child, bookKeeping.count++); // bookKeeping.count++为children中子孙节点的总数  
}

/**
 * Iterates through children that are typically specified as `props.children`.
 *
 * See https://facebook.github.io/react/docs/top-level-api.html#react.children.foreach
 *
 * The provided forEachFunc(child, index) will be called for each
 * leaf child.
 *
 * @param {?*} children Children tree container.
 * @param {function(*, int)} forEachFunc
 * @param {*} forEachContext Context for forEachContext.
 */
// 将用户配置的执行函数forEachFunc、和执行上下文forEachContext存入实例traverseContext中
// traverseAllChildren遍历children，调用forEachSingleChild对children中的每一项执行forEachFunc函数
// 最后调用release方法释放内存
function forEachChildren(children, forEachFunc, forEachContext) {
  if (children == null) {
    return children;
  }
  var traverseContext = ForEachBookKeeping.getPooled(
    forEachFunc,
    forEachContext,
  );
  traverseAllChildren(children, forEachSingleChild, traverseContext);
  ForEachBookKeeping.release(traverseContext);
}

/**
 * PooledClass representing the bookkeeping associated with performing a child
 * mapping. Allows avoiding binding callbacks.
 *
 * @constructor MapBookKeeping
 * @param {!*} mapResult Object containing the ordered map of results.
 * @param {!function} mapFunction Function to perform mapping with.
 * @param {?*} mapContext Context to perform mapping with.
 */
// this.result存储执行mapFunction函数后获取得到的ReactNode
// this.keyPrefix作为ReactNode的key值前缀
function MapBookKeeping(mapResult, keyPrefix, mapFunction, mapContext) {
  this.result = mapResult;
  this.keyPrefix = keyPrefix;
  this.func = mapFunction;
  this.context = mapContext;
  this.count = 0;
}
MapBookKeeping.prototype.destructor = function() {
  this.result = null;
  this.keyPrefix = null;
  this.func = null;
  this.context = null;
  this.count = 0;
};
PooledClass.addPoolingTo(MapBookKeeping, fourArgumentPooler);

function mapSingleChildIntoContext(bookKeeping, child, childKey) {
  var {result, keyPrefix, func, context} = bookKeeping;

  var mappedChild = func.call(context, child, bookKeeping.count++);
  // 对ReactNode数据格式的child执行func函数后返回数组，将该数组项填入result中
  // 比如props.children挂载的ReactNode节点劫持渲染其props属性中的ReactNode
  if (Array.isArray(mappedChild)) {
    mapIntoWithKeyPrefixInternal(
      mappedChild,
      result,
      childKey,
      emptyFunction.thatReturnsArgument,
    );
    // 对ReactNode数据格式的child执行func函数后返回ReactNode，将该ReactNode推入result中  
    // 并替换该ReactNode的key值为节点路径形式 
  } else if (mappedChild != null) {
    if (ReactElement.isValidElement(mappedChild)) {
      mappedChild = ReactElement.cloneAndReplaceKey(
        mappedChild,
        // Keep both the (mapped) and old keys if they differ, just as
        // traverseAllChildren used to do for objects as children
        keyPrefix +
          (mappedChild.key && (!child || child.key !== mappedChild.key)
            ? escapeUserProvidedKey(mappedChild.key) + '/'
            : '') +
          childKey,
      );
    }
    result.push(mappedChild);
  }
}

// 遍历props.children子孙元素执行func，将func的返回值推入array中
function mapIntoWithKeyPrefixInternal(children, array, prefix, func, context) {
  var escapedPrefix = '';
  if (prefix != null) {
    escapedPrefix = escapeUserProvidedKey(prefix) + '/';
  }
  var traverseContext = MapBookKeeping.getPooled(
    array,
    escapedPrefix,
    func,
    context,
  );
  traverseAllChildren(children, mapSingleChildIntoContext, traverseContext);
  MapBookKeeping.release(traverseContext);
}

/**
 * Maps children that are typically specified as `props.children`.
 *
 * See https://facebook.github.io/react/docs/top-level-api.html#react.children.map
 *
 * The provided mapFunction(child, key, index) will be called for each
 * leaf child.
 * 遍历children子孙元素执行func，将func的返回值推入result中，并返回result
 *
 * @param {?*} children Children tree container.
 * @param {function(*, int)} func The map function.
 * @param {*} context Context for mapFunction.
 * @return {object} Object containing the ordered map of results.
 */
function mapChildren(children, func, context) {
  if (children == null) {
    return children;
  }
  var result = [];
  mapIntoWithKeyPrefixInternal(children, result, null, func, context);
  return result;
}

function forEachSingleChildDummy(traverseContext, child, name) {
  return null;
}

/**
 * Count the number of children that are typically specified as
 * `props.children`.
 * 计算children中含有ReactNode的个数 
 * See https://facebook.github.io/react/docs/top-level-api.html#react.children.count
 *
 * @param {?*} children Children tree container.
 * @return {number} The number of children.
 */
function countChildren(children, context) {
  return traverseAllChildren(children, forEachSingleChildDummy, null);
}

/**
 * Flatten a children object (typically specified as `props.children`) and
 * return an array with appropriately re-keyed children.
 * 将嵌套的子孙节点转化为单层数组形式，emptyFunction.thatReturnsArgument返回传参ReactNode
 * See https://facebook.github.io/react/docs/top-level-api.html#react.children.toarray
 */
function toArray(children) {
  var result = [];
  mapIntoWithKeyPrefixInternal(
    children,
    result,
    null,
    emptyFunction.thatReturnsArgument,
  );
  return result;
}

var ReactChildren = {
  // ReactChildren.forEach(children,func,context)  
  // 遍历props.children子孙节点，执行func函数
  forEach: forEachChildren,
  // ReactChildren.map(children,func,context)
  // 遍历props.children子孙节点，执行func函数，func返回值组装成数组形式的ReactNode，即result后输出
  // 与forEach不同的是，forEach只为执行func函数，map获取result
  map: mapChildren,
  // ReactChildren.mapIntoWithKeyPrefixInternal(children,array,prefix,func,context)
  // 遍历props.children子孙元素执行func，将func的返回值推入array中
  // 与map方法不同的是，可实现功能定制，比如实现count、toArray方法
  mapIntoWithKeyPrefixInternal: mapIntoWithKeyPrefixInternal,
  // ReactChildren.countChildren(children,context)
  // 统计props.children含有ReactNode个数
  count: countChildren,
  // ReactChildren.toArray(children)
  // 将嵌套式的props.children转化为数组形式的ReactNode
  toArray: toArray,
};

module.exports = ReactChildren;
