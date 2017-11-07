/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule CallbackQueue
 * @flow
 */

'use strict';
/**
 * CallbackQueue模块用于添加、执行、重置回调函数队列，机制同jquery中的同名模块。
 */

// PooledClass.addPoolingTo(CopyConstructor)用于将构造函数CopyConstructor转化为工厂函数  
// 意义是管理实例数据的创建和销毁，并将销毁数据的实例推入到实例池CopyConstructor.instancePool中 
var PooledClass = require('PooledClass');

var invariant = require('invariant');

/**
 * A specialized pseudo-event module to help keep track of components waiting to
 * be notified when their DOM representations are available for use.
 *
 * This implements `PooledClass`, so you should never need to instantiate this.
 * Instead, use `CallbackQueue.getPooled()`.
 * 
 * 用于添加、执行、重置回调函数队列；react中实际使用是用于挂载componentDidMount等钩子方法
 * 通过PooledClass模块管理实例的创建CallbackQueue.getPooled，以及实例数据的销毁CallbackQueue.release
 *
 * @class ReactMountReady
 * @implements PooledClass
 * @internal
 */
class CallbackQueue<T> {
  _callbacks: ?Array<() => void>;
  _contexts: ?Array<T>;
  _arg: ?mixed;

  constructor(arg) {
    this._callbacks = null;
    this._contexts = null;
    this._arg = arg;
  }

  /**
   * Enqueues a callback to be invoked when `notifyAll` is invoked.
   * 往回调队列中添加回调函数及其执行的上下文，通过notifyAll方法触发
   *
   * @param {function} callback Invoked when `notifyAll` is invoked.
   * @param {?object} context Context to call `callback` with.
   * @internal
   */
  enqueue(callback: () => void, context: T) {
    this._callbacks = this._callbacks || [];
    this._callbacks.push(callback);
    this._contexts = this._contexts || [];
    this._contexts.push(context);
  }

  /**
   * Invokes all enqueued callbacks and clears the queue. This is invoked after
   * the DOM representation of a component has been created or updated.
   * 触发回调函数队列内函数的执行；回调函数个数与其执行上下文个数不匹配，则报错
   *
   * @internal
   */
  notifyAll() {
    var callbacks = this._callbacks;
    var contexts = this._contexts;
    var arg = this._arg;
    if (callbacks && contexts) {
      invariant(
        callbacks.length === contexts.length,
        'Mismatched list of contexts in callback queue',
      );
      this._callbacks = null;
      this._contexts = null;
      for (var i = 0; i < callbacks.length; i++) {
        callbacks[i].call(contexts[i], arg);
      }
      callbacks.length = 0;
      contexts.length = 0;
    }
  }

  // 获取回调函数队列中的回调函数个数 
  checkpoint() {
    return this._callbacks ? this._callbacks.length : 0;
  }

  // 将回调函数队列中的回调函数个数设定为参数len
  rollback(len: number) {
    if (this._callbacks && this._contexts) {
      this._callbacks.length = len;
      this._contexts.length = len;
    }
  }

  /**
   * Resets the internal queue.
   * 重置回调函数队列
   *
   * @internal
   */
  reset() {
    this._callbacks = null;
    this._contexts = null;
  }

  /**
   * `PooledClass` looks for this.
   * PooledClass模块装饰需要，设置destructor方法供release方法使用，用于销毁实例数据
   */
  destructor() {
    this.reset();
  }
}

module.exports = PooledClass.addPoolingTo(CallbackQueue);
