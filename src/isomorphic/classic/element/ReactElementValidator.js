/**
 * Copyright 2014-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactElementValidator
 */

/**
 * ReactElementValidator provides a wrapper around a element factory
 * which validates the props passed to the element. This is intended to be
 * used only in DEV and could be replaced by a static type checker for languages
 * that support it.
 */

'use strict';

// 保存容器组件，即用户自定义组件的ReactCompositeComponent实例，添加ref引用的需要  
// 同时用于提示用户加载的组件模块书写错
var ReactCurrentOwner = require('ReactCurrentOwner');
// ReactComponentTreeHook.getCurrentStackAddendum用于获取容器组件的信息  
var ReactComponentTreeHook = require('ReactComponentTreeHook');
var ReactElement = require('ReactElement');

// 根据组件的propTypes静态属性校验props
var checkReactTypeSpec = require('checkReactTypeSpec');
// 获取迭代行数
var getIteratorFn = require('getIteratorFn');
var warning = require('warning');

// 提示用户书写有错的组件函数名
function getDeclarationErrorAddendum() {
  if (ReactCurrentOwner.current) {
    var name = ReactCurrentOwner.current.getName();
    if (name) {
      return ' Check the render method of `' + name + '`.';
    }
  }
  return '';
}
// 提示source错误的信息
function getSourceInfoErrorAddendum(elementProps) {
  if (
    elementProps !== null &&
    elementProps !== undefined &&
    elementProps.__source !== undefined
  ) {
    var source = elementProps.__source;
    var fileName = source.fileName.replace(/^.*[\\\/]/, '');
    var lineNumber = source.lineNumber;
    return ' Check your code at ' + fileName + ':' + lineNumber + '.';
  }
  return '';
}

/**
 * Warn if there's no key explicitly set on dynamic arrays of children or
 * object keys are not valid. This allows us to keep track of children between
 * updates.
 * 初次创建时警告，props.children未改变引起的更新不警告
 */
var ownerHasKeyUseWarning = {};

// props.children的直系父组件信息
function getCurrentComponentErrorInfo(parentType) {
  var info = getDeclarationErrorAddendum();

  if (!info) {
    var parentName = typeof parentType === 'string'
      ? parentType
      : parentType.displayName || parentType.name;
    if (parentName) {
      info = ` Check the top-level render call using <${parentName}>.`;
    }
  }
  return info;
}

/**
 * Warn if the element doesn't have an explicit key assigned to it.
 * This element is in an array. The array could grow and shrink or be
 * reordered. All children that haven't already been validated are required to
 * have a "key" property assigned to it. Error statuses are cached so a warning
 * will only be shown once.
 * props.children单个值中含有多个ReactElement时，缺失key值警告直系父组件书写有误 
 *
 * @internal
 * @param {ReactElement} element Element that requires a key.
 * @param {*} parentType element's parent's type.
 */
function validateExplicitKey(element, parentType) {
  if (!element._store || element._store.validated || element.key != null) {
    return;
  }
  element._store.validated = true;

  var memoizer =
    ownerHasKeyUseWarning.uniqueKey || (ownerHasKeyUseWarning.uniqueKey = {});

  // 获取props.children的直系父组件信息 
  var currentComponentErrorInfo = getCurrentComponentErrorInfo(parentType);
  if (memoizer[currentComponentErrorInfo]) {
    return;
  }
  memoizer[currentComponentErrorInfo] = true;

  // Usually the current owner is the offender, but if it accepts children as a
  // property, it may be the creator of the child that's responsible for
  // assigning it a key.
  var childOwner = '';
  if (
    element &&
    element._owner &&
    element._owner !== ReactCurrentOwner.current
  ) {
    // Give the component that originally created this child.
    childOwner = ` It was passed a child from ${element._owner.getName()}.`;
  }

  warning(
    false,
    'Each child in an array or iterator should have a unique "key" prop.' +
      '%s%s See https://fb.me/react-warning-keys for more information.%s',
    currentComponentErrorInfo,
    childOwner,
    ReactComponentTreeHook.getCurrentStackAddendum(element),
  );
}

/**
 * Ensure that every element either is passed in a static location, in an
 * array with an explicit keys property defined, or in an object literal
 * with valid key property.
 * 校验props.children的每项，单个值只校验是否是ReactElement，多个值再校验是否存在key属性
 *
 * @internal
 * @param {ReactNode} node Statically passed child of any type.
 * @param {*} parentType node's parent's type.
 */
function validateChildKeys(node, parentType) {
  if (typeof node !== 'object') {
    return;
  }
  // 数组形式
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) {
      var child = node[i];
      if (ReactElement.isValidElement(child)) {
        validateExplicitKey(child, parentType);
      }
    }
  } else if (ReactElement.isValidElement(node)) { // 数组形式
    // This element was passed in a valid location.
    if (node._store) {
      node._store.validated = true;
    }
  } else if (node) { // 迭代器形式
    var iteratorFn = getIteratorFn(node);
    // Entry iterators provide implicit keys.
    if (iteratorFn) {
      if (iteratorFn !== node.entries) {
        var iterator = iteratorFn.call(node);
        var step;
        while (!(step = iterator.next()).done) {
          if (ReactElement.isValidElement(step.value)) {
            validateExplicitKey(step.value, parentType);
          }
        }
      }
    }
  }
}

/**
 * Given an element, validate that its props follow the propTypes definition,
 * provided by the type.
 * 根据组件的propTypes静态属性校验props，同时提示getDefaultProps只能用于React.createClass方法创建的组件 
 *
 * @param {ReactElement} element
 */
function validatePropTypes(element) {
  var componentClass = element.type;
  if (typeof componentClass !== 'function') {
    return;
  }
  var name = componentClass.displayName || componentClass.name;
  if (componentClass.propTypes) {
    checkReactTypeSpec(
      componentClass.propTypes,
      element.props,
      'prop',
      name,
      element,
      null,
    );
  }
  if (typeof componentClass.getDefaultProps === 'function') {
    warning(
      componentClass.getDefaultProps.isReactClassApproved,
      'getDefaultProps is only used on classic React.createClass ' +
        'definitions. Use a static property named `defaultProps` instead.',
    );
  }
}

var ReactElementValidator = {
  createElement: function(type, props, children) {
    var validType = typeof type === 'string' || typeof type === 'function';
    // We warn in this case but don't throw. We expect the element creation to
    // succeed and there will likely be errors in render.
    // 传参type用户自定义组件构造函数、或ReactDomComponent的类型字符串有误
    if (!validType) {
      if (typeof type !== 'function' && typeof type !== 'string') {
        var info = '';
        // 用于提示用户加载的组件模块可能尚未导出组件的构造函数  
        if (
          type === undefined ||
          (typeof type === 'object' &&
            type !== null &&
            Object.keys(type).length === 0)
        ) {
          info +=
            ' You likely forgot to export your component from the file ' +
            "it's defined in.";
        }

        // 提示用户书写有错的组件构造函数名
        var sourceInfo = getSourceInfoErrorAddendum(props);
        if (sourceInfo) {
          info += sourceInfo;
        } else {
          info += getDeclarationErrorAddendum();
        }

        info += ReactComponentTreeHook.getCurrentStackAddendum();

        var currentSource = props !== null &&
          props !== undefined &&
          props.__source !== undefined
          ? props.__source
          : null;
        ReactComponentTreeHook.pushNonStandardWarningStack(true, currentSource);
        warning(
          false,
          'React.createElement: type is invalid -- expected a string (for ' +
            'built-in components) or a class/function (for composite ' +
            'components) but got: %s.%s',
          type == null ? type : typeof type,
          info,
        );
        ReactComponentTreeHook.popNonStandardWarningStack();
      }
    }

    var element = ReactElement.createElement.apply(this, arguments);

    // The result can be nullish if a mock or a custom function is used.
    // TODO: Drop this when these are no longer allowed as the type argument.
    if (element == null) {
      return element;
    }

    // Skip key warning if the type isn't valid since our key validation logic
    // doesn't expect a non-string/function type and can throw confusing errors.
    // We don't want exception behavior to differ between dev and prod.
    // (Rendering will throw with a helpful message and as soon as the type is
    // fixed, the key warnings will appear.)
    // 校验props.children的每项，单个值只校验是否ReactElement，多个值再校验是否存在key属性
    if (validType) {
      for (var i = 2; i < arguments.length; i++) {
        validateChildKeys(arguments[i], type);
      }
    }

    // 根据组件的propTypes静态属性校验props，同时提示getDefaultProps只能用于React.createClass方法创建的组件
    validatePropTypes(element);

    return element;
  },

  createFactory: function(type) {
    var validatedFactory = ReactElementValidator.createElement.bind(null, type);
    // Legacy hook TODO: Warn if this is accessed
    validatedFactory.type = type;

    return validatedFactory;
  },

  cloneElement: function(element, props, children) {
    var newElement = ReactElement.cloneElement.apply(this, arguments);
    for (var i = 2; i < arguments.length; i++) {
      validateChildKeys(arguments[i], newElement.type);
    }
    validatePropTypes(newElement);
    return newElement;
  },
};

module.exports = ReactElementValidator;
