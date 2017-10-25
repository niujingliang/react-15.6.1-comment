/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule DOMProperty
 */

'use strict';
// DOMProperty模块用于加载节点属性插件，最终影响DOMPropertyOperation模块对节点属性的添加移除处理。

var invariant = require('invariant');

// 获取是否以node[propName]=value方式添加属性，或属性值处理方式 
function checkMask(value, bitmask) {
  return (value & bitmask) === bitmask;
}

var DOMPropertyInjection = {
  /**
   * Mapping from normalized, camelcased property names to a configuration that
   * specifies how the associated DOM property should be accessed or rendered.
   * 映射规范，camelcased属性名称配置关联dom的访问和渲染。
   */
  MUST_USE_PROPERTY: 0x1, // 0x 16位 以node[propName]=value方式添加属性
  HAS_BOOLEAN_VALUE: 0x4, // 过滤否值
  HAS_NUMERIC_VALUE: 0x8, // 过滤非数值型
  HAS_POSITIVE_NUMERIC_VALUE: 0x10 | 0x8, // 过滤非正数型
  HAS_OVERLOADED_BOOLEAN_VALUE: 0x20, // 过滤false

  /**
   * Inject some specialized knowledge about the DOM. This takes a config object
   * with the following properties:
   *
   * isCustomAttribute: function that given an attribute name will return true
   * if it can be inserted into the DOM verbatim. Useful for data-* or aria-*
   * attributes where it's impossible to enumerate all of the possible
   * attribute names,
   *
   * Properties: object mapping DOM property name to one of the
   * DOMPropertyInjection constants or null. If your attribute isn't in here,
   * it won't get written to the DOM.
   *
   * DOMAttributeNames: object mapping React attribute name to the DOM
   * attribute name. Attribute names not specified use the **lowercase**
   * normalized name.
   *
   * DOMAttributeNamespaces: object mapping React attribute name to the DOM
   * attribute namespace URL. (Attribute names not specified use no namespace.)
   *
   * DOMPropertyNames: similar to DOMAttributeNames but for DOM properties.
   * Property names not specified use the normalized name.
   *
   * DOMMutationMethods: Properties that require special mutation methods. If
   * `value` is undefined, the mutation method should unset the property.
   * 
   * 节点属性插件的写法，即含有的属性:
   * isCustomAttribute: 函数，返回真值，将添加到节点的属性，如HTMLDOMPropertyConfig模块的data-、aria- 
   * Properties: 设定属性值类型处理方式的集合，如某属性值为0x4，否值将不会添加为节点的属性
   * DOMAttributeNames: 键值对存储属性名，以字符串形式拼接属性名及其值时使用
   * DOMAttributeNamespaces: 键值对约定属性命名空间的集合
   * DOMPropertyNames: Properties中属性设为0x1，即MUST_USE_PROPERTY时，node[propName]=value方式添加属性的属性名集合
   * DOMMutationMethods: 存储设定属性值的方法集，如{propName:(node,value)=>{}}
   *
   * @param {object} domPropertyConfig the config as described above.
   */
  injectDOMPropertyConfig: function(domPropertyConfig) {
    var Injection = DOMPropertyInjection;
    // 设定属性值类型处理方式的集合，如某属性值为0x4，否值将不会添加为节点的属性
    var Properties = domPropertyConfig.Properties || {};
    // 约定属性命名空间的集合
    var DOMAttributeNamespaces = domPropertyConfig.DOMAttributeNamespaces || {};
    // react属性名到浏览器节点属性名的映射，如{className:"class"}
    var DOMAttributeNames = domPropertyConfig.DOMAttributeNames || {};
    // 存储属性的命名空间
    var DOMPropertyNames = domPropertyConfig.DOMPropertyNames || {};
    // 存储设定属性值的方法集，如{propName:(node,value)=>{}}
    var DOMMutationMethods = domPropertyConfig.DOMMutationMethods || {};
    // 自定义属性校验，通过则将添加到节点的相应属性上，如HTMLDOMPropertyConfig模块的data-、aria-
    if (domPropertyConfig.isCustomAttribute) {
      DOMProperty._isCustomAttributeFunctions.push(
        domPropertyConfig.isCustomAttribute,
      );
    }

    for (var propName in Properties) {
      // 同名属性不能加载两次，也即各节点属性插件的属性名不能相冲
      invariant(
        !DOMProperty.properties.hasOwnProperty(propName),
        "injectDOMPropertyConfig(...): You're trying to inject DOM property " +
          "'%s' which has already been injected. You may be accidentally " +
          'injecting the same DOM property config twice, or you may be ' +
          'injecting two configs that have conflicting property names.',
        propName,
      );

      var lowerCased = propName.toLowerCase();
      // 节点属性插件中，propName指代属性名，Properties[propName]约定类型
      // Properties[propName]同DOMPropertyInjection.HAS_NUMERIC_VALUE等属性作按位与比较
      // 两者等值时，属性值须设为DOMPropertyInjection.HAS_NUMERIC_VALUE等属性的字面类型
      // 即DOMPropertyInjection.HAS_NUMERIC_VALUE要求节点的属性为数值
      var propConfig = Properties[propName];

      var propertyInfo = {
        // 拼接字符串方式添加节点属性时，作为属性名
        attributeName: lowerCased,
        // 属性的命名空间，node.setAttributeNS(namespace,attr,value)添加属性；初始化为null
        attributeNamespace: null,
        // propertyInfo.mustUseProperty为真值时，node[propertyInfo[propertyName]]设置节点的属性时作为节点的属性名
        propertyName: propName,
        // 设置属性值的方法，(node,value)=>{}形式；初始化为null
        mutationMethod: null,

        // 为真值时，以node[propertyInfo[propertyName]]设置节点的属性，而非setAttribute方法  
        // 处理ie8、9setAttribute方法将属性值转化为字符串`[object]`的兼容性问题
        mustUseProperty: checkMask(propConfig, Injection.MUST_USE_PROPERTY),
        // value是否bool类型
        hasBooleanValue: checkMask(propConfig, Injection.HAS_BOOLEAN_VALUE),
        // value是否数值类型
        hasNumericValue: checkMask(propConfig, Injection.HAS_NUMERIC_VALUE),
        // value是否正数类型
        hasPositiveNumericValue: checkMask(
          propConfig,
          Injection.HAS_POSITIVE_NUMERIC_VALUE,
        ),
        hasOverloadedBooleanValue: checkMask(
          propConfig,
          Injection.HAS_OVERLOADED_BOOLEAN_VALUE,
        ),
      };
      // 属性值的类型设定相冲，如不能既是布尔型，又是数值型
      invariant(
        propertyInfo.hasBooleanValue +
          propertyInfo.hasNumericValue +
          propertyInfo.hasOverloadedBooleanValue <=
          1,
        'DOMProperty: Value can be one of boolean, overloaded boolean, or ' +
          'numeric value, but not a combination: %s',
        propName,
      );

      if (__DEV__) {
        DOMProperty.getPossibleStandardName[lowerCased] = propName;
      }

      // 节点属性插件的DOMAttributeNames属性是react属性名到浏览器节点属性名的映射，如className映射为class
      // 以字符串形式拼接属性名及其值时使用
      if (DOMAttributeNames.hasOwnProperty(propName)) {
        var attributeName = DOMAttributeNames[propName];
        propertyInfo.attributeName = attributeName;
        if (__DEV__) {
          DOMProperty.getPossibleStandardName[attributeName] = propName;
        }
      }
      // 提取节点属性插件DOMAttributeNamespaces的命名空间
      if (DOMAttributeNamespaces.hasOwnProperty(propName)) {
        propertyInfo.attributeNamespace = DOMAttributeNamespaces[propName];
      }
      // DOMPropertyNames存放propertyInfo.mustUseProperty为真值时可添加的属性名集合      
      if (DOMPropertyNames.hasOwnProperty(propName)) {
        propertyInfo.propertyName = DOMPropertyNames[propName];
      }
      // propertyInfo.mutationMethod设置属性值的方法，(node,value)=>{}形式
      if (DOMMutationMethods.hasOwnProperty(propName)) {
        propertyInfo.mutationMethod = DOMMutationMethods[propName];
      }

      DOMProperty.properties[propName] = propertyInfo;
    }
  },
};

/* eslint-disable max-len */
var ATTRIBUTE_NAME_START_CHAR =
  ':A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD';
/* eslint-enable max-len */

/**
 * DOMProperty exports lookup objects that can be used like functions:
 *
 *   > DOMProperty.isValid['id']
 *   true
 *   > DOMProperty.isValid['foobar']
 *   undefined
 *
 * Although this may be confusing, it performs better in general.
 *
 * @see http://jsperf.com/key-exists
 * @see http://jsperf.com/key-missing
 */
var DOMProperty = {
  ID_ATTRIBUTE_NAME: 'data-reactid',
  ROOT_ATTRIBUTE_NAME: 'data-reactroot',
  // 用于校验属性名
  ATTRIBUTE_NAME_START_CHAR: ATTRIBUTE_NAME_START_CHAR,
  ATTRIBUTE_NAME_CHAR:
    ATTRIBUTE_NAME_START_CHAR + '\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040',

  /**
   * Map from property "standard name" to an object with info about how to set
   * the property in the DOM. Each object contains:
   *
   * attributeName:
   *   Used when rendering markup or with `*Attribute()`.
   * attributeNamespace
   * propertyName:
   *   Used on DOM node instances. (This includes properties that mutate due to
   *   external factors.)
   * mutationMethod:
   *   If non-null, used instead of the property or `setAttribute()` after
   *   initial render.
   * mustUseProperty:
   *   Whether the property must be accessed and mutated as an object property.
   * hasBooleanValue:
   *   Whether the property should be removed when set to a falsey value.
   * hasNumericValue:
   *   Whether the property must be numeric or parse as a numeric and should be
   *   removed when set to a falsey value.
   * hasPositiveNumericValue:
   *   Whether the property must be positive numeric or parse as a positive
   *   numeric and should be removed when set to a falsey value.
   * hasOverloadedBooleanValue:
   *   Whether the property can be used as a flag as well as with a value.
   *   Removed when strictly equal to false; present without a value when
   *   strictly equal to true; present with a value otherwise.
   * 
   * 设定属性名添加或移除方式 
   * attributeName: 拼接字符串方式
   * attributeNamespace: 属性的命名空间
   * propertyName: mustUseProperty为真值时，node[propName]方式添加或移除属性时，作为propName
   * mutationMethod: 设置属性值的方法，(node,value)=>{}形式，优先级最高
   * mustUseProperty: 是否以node[propertyInfo[propertyName]]设置节点的属性，而非setAttribute方法设定属性值的提取方式 
   * hasBooleanValue: 属性值设为否值时不添加到dom元素上 
   * hasNumericValue: 属性值须设置为数值型或可转化成数值型的字符串，否则不添加到dom元素上 
   * hasPositiveNumericValue: 属性值须设置为正数，否则不添加到dom元素上 
   * hasOverloadedBooleanValue: 属性值为false时不添加到dom元素上 
   */
  properties: {},

  /**
   * Mapping from lowercase property names to the properly cased version, used
   * to warn in the case of missing properties. Available only in __DEV__.
   *
   * autofocus is predefined, because adding it to the property whitelist
   * causes unintended side effects.
   * 
   * 存储小写形式的节点属性到react节点属性的映射，如{class:"className"}等；调试用
   * 
   * @type {Object}
   */
  getPossibleStandardName: __DEV__ ? {autofocus: 'autoFocus'} : null,

  /**
   * All of the isCustomAttribute() functions that have been injected.
   * 存储各节点属性插件的isCustomAttribute方法，如HTMLDOMPropertyConfig模块的isCustomAttribute方法
   */
  _isCustomAttributeFunctions: [],

  /**
   * Checks whether a property name is a custom attribute.
   * 是否允许设置dom节点的自定义属性attributeName，如HTMLDOMPropertyConfig模块设定以data-或aria-起始的属性名
   * 
   * @method
   */
  isCustomAttribute: function(attributeName) {
    for (var i = 0; i < DOMProperty._isCustomAttributeFunctions.length; i++) {
      var isCustomAttributeFn = DOMProperty._isCustomAttributeFunctions[i];
      if (isCustomAttributeFn(attributeName)) {
        return true;
      }
    }
    return false;
  },

  // 通过ReactDefaultInjection模块加载节点属性插件，如ARIADOMPropertyConfig、
  // HTMLDOMPropertyConfig、SVGDOMPropertyConfig  
  // 最终为当前模块的DOMProperty.properties、DOMProperty._isCustomAttributeFunctions注入内容
  injection: DOMPropertyInjection,
};

module.exports = DOMProperty;
