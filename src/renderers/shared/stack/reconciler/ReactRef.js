/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactRef
 * @flow
 */

'use strict';
/**
 * ReactRef模块提供方法用于向顶层用户自定义组件实例添加或移除refs、或比较refs是否需要更新。通过ReactRonconcile模块间接被ReactCompositeComponent模块调用。
 */


// 调用顶层用户自定义组件的attachRef、detachRef方法，用于添加refs属性
var ReactOwner = require('ReactOwner');

import type {ReactInstance} from 'ReactInstanceType';
import type {ReactElement} from 'ReactElementType';

var ReactRef = {};

/**
 * 向用户自定义组件实例添加ref，值为子组件实例component.getPublicInstance()
 * 参数ref为定义在顶层用户自定义组件下的ref属性配置函数(component)=>{this.C=component}，或string形式，将向顶层用户自定义组件添加this.refs[ref]属性
 * 参数component为子组件的ReactCompositeComponent实例
 * 调用getPublicInstance获取ReactComponent或ReactDomComponent实例
 * 参数owner为顶层用户自定义组件的挂载类ReactCompositeComponent实例   
 */
function attachRef(ref, component, owner) {
  if (typeof ref === 'function') {
    // 函数由用户自定义组件owner调用ReactRenconciler中方法执行，this指向owner 
    ref(component.getPublicInstance());
  } else {
    // Legacy ref
    // 间接通过用户自定义组件实例owner的attachRef方法，向该实例添加this.refs[ref]属性 
    ReactOwner.addComponentAsRefTo(component, ref, owner);
  }
}

// 移除用户自定义组件的ref
function detachRef(ref, component, owner) {
  if (typeof ref === 'function') {
    ref(null);
  } else {
    // Legacy ref
    ReactOwner.removeComponentAsRefFrom(component, ref, owner);
  }
}

/**
 * 调用attachRef函数，为顶层用户自定义组件实例element._owner添加ref，其值为子组件实例
 * @param {*} instance 参数instance为顶层用户自定义组件实例下挂载的子组件实例，ReactCompositeComponent实例.调用getPublicInstance获取ReactComponent或ReactDomComponent实例
 * @param {*} element 参数element为ReactCompositeComponent实例中创建的racetNode，即以ReactComponent或ReactDomComponent为构造函数的元素.特别的，element._owner为顶层用户自定义组件的实例
 */
ReactRef.attachRefs = function(
  instance: ReactInstance,
  element: ReactElement | string | number | null | false,
): void {
  if (element === null || typeof element !== 'object') {
    return;
  }
  var ref = element.ref; // 用户设置的元素的ref属性，函数或者字符串
  if (ref != null) {
    // element._owner，当使用JSX方式书写reactNode时，其_owner属性指向用户自定义组件的挂载类ReactCompositeComponent实例  
    // 用户自定义组件即容器组件的render方法中调用React.createElement时将注入该容器组件的相关ReactCompositeComponent实例  
    attachRef(ref, instance, element._owner);
  }
};

// 当元素的ref属性设置变更，或者顶层用户自定义组件变更且ref为字符串时，更新refs
ReactRef.shouldUpdateRefs = function(
  prevElement: ReactElement | string | number | null | false,
  nextElement: ReactElement | string | number | null | false,
): boolean {
  // If either the owner or a `ref` has changed, make sure the newest owner
  // has stored a reference to `this`, and the previous owner (if different)
  // has forgotten the reference to `this`. We use the element instead
  // of the public this.props because the post processing cannot determine
  // a ref. The ref conceptually lives on the element.

  // TODO: Should this even be possible? The owner cannot change because
  // it's forbidden by shouldUpdateReactComponent. The ref can change
  // if you swap the keys of but not the refs. Reconsider where this check
  // is made. It probably belongs where the key checking and
  // instantiateReactComponent is done.

  var prevRef = null;
  var prevOwner = null;
  if (prevElement !== null && typeof prevElement === 'object') {
    prevRef = prevElement.ref;
    prevOwner = prevElement._owner;
  }

  var nextRef = null;
  var nextOwner = null;
  if (nextElement !== null && typeof nextElement === 'object') {
    nextRef = nextElement.ref;
    nextOwner = nextElement._owner;
  }

  return (
    prevRef !== nextRef ||
    // If owner changes but we have an unchanged function ref, don't update refs
    // 顶层用户自定义组件已变更，然而ref为函数形式，无需更新refs  
    (typeof nextRef === 'string' && nextOwner !== prevOwner)
  );
};

// 调用detachRef函数，移除顶层用户自定义组件实例element._owner的ref
ReactRef.detachRefs = function(
  instance: ReactInstance,
  element: ReactElement | string | number | null | false,
): void {
  if (element === null || typeof element !== 'object') {
    return;
  }
  var ref = element.ref;
  if (ref != null) {
    detachRef(ref, instance, element._owner);
  }
};

module.exports = ReactRef;
