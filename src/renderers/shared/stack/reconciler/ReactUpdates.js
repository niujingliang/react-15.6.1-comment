/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactUpdates
 */

'use strict';
/**
 * ReactUpdates模块约定组件重绘过程的前后钩子，包含ReactReconcileTransaction模块的前后钩子(可添加componentDidUpdate回调，及向组件提供updater参数，以使setState等方法可用)，
 * 以及本模块ReactUpdatesFlushTransaction函数设定的前后钩子(可添加组件重绘完成后的回调callback)；
 * 通过ReactUpdates.ReactReconcileTransaction提供ReactReconcileTransaction模块的接口；
 * 通过ReactUpdates.enqueueUpdate调用ReactDefaultBatchingStrategy模块，用于添加脏组件或触发重绘;
 * 通过ReactUpdates.batchedUpdates(fn)执行fn函数，并触发重绘等。
 */


// 原型继承Transaction的某构造函数的实例将拥有perform(method,args)方法    
// 实现功能为，method函数执行前后，调用成对的前置钩子initialize、及后置钩子close；initialize为close提供参数  
// CallbackQueue模块用于添加、执行、重置回调函数队列，机能同jquery中的同名模块。
var CallbackQueue = require('CallbackQueue');
// PooledClass.addPoolingTo(CopyConstructor)用于将构造函数CopyConstructor转化为工厂函数，
// 意义是管理实例数据的创建和销毁，并将销毁数据的实例推入到实例池CopyConstructor.instancePool中。
var PooledClass = require('PooledClass');
// React性能分析标识
var ReactFeatureFlags = require('ReactFeatureFlags');
// 模块用于发起顶层组件或子组件的挂载、卸载、重绘机制。
var ReactReconciler = require('ReactReconciler');
// 原型继承Transaction的某构造函数的实例将拥有perform(method,args)方法    
// 实现功能为，method函数执行前后，调用成对的前置钩子initialize、及后置钩子close；initialize为close提供参数 
var Transaction = require('Transaction');

var invariant = require('invariant');

var dirtyComponents = [];
var updateBatchNumber = 0;
var asapCallbackQueue = CallbackQueue.getPooled();
var asapEnqueued = false;

var batchingStrategy = null;

// 确认ReactUpdates.ReactReconcileTransaction、batchingStrategy已添加  
function ensureInjected() {
  invariant(
    ReactUpdates.ReactReconcileTransaction && batchingStrategy,
    'ReactUpdates: must inject a reconcile transaction class and batching ' +
      'strategy',
  );
}

// 组件更新前置钩子，将this.dirtyComponentsLength置为dirtyComponents中脏组件的个数
// 组件更新后置钩子，重绘过程中添加脏组件，调用flushBatchedUpdates重绘新添加的脏组件
// 重绘过程中没有添加脏组件，dirtyComponents清空
var NESTED_UPDATES = {
  initialize: function() {
    this.dirtyComponentsLength = dirtyComponents.length;
  },
  close: function() {
    // 在组件重绘过程中，再度添加脏组件，剔除dirtyComponents中已重绘的组件，调用flushBatchedUpdates重绘新添加的脏组件
    if (this.dirtyComponentsLength !== dirtyComponents.length) {
      // Additional updates were enqueued by componentDidUpdate handlers or
      // similar; before our own UPDATE_QUEUEING wrapper closes, we want to run
      // these new updates so that if A's componentDidUpdate calls setState on
      // B, B will update before the callback A's updater provided when calling
      // setState.
      dirtyComponents.splice(0, this.dirtyComponentsLength);
      flushBatchedUpdates();
    } else {
      dirtyComponents.length = 0;
    }
  },
};

// 通过CallbackQueue回调函数队列机制，即this.callbackQueue
// 执行this.callbackQueue.enqueue(fn)注入组件更新完成后的回调callback，在runBatchedUpdates函数中实现
// 通过Transaction添加前、后置钩子机制
// 前置钩子initialize方法用于清空回调队列；close用于触发组件更新完成后的回调callback
var UPDATE_QUEUEING = {
  initialize: function() {
    this.callbackQueue.reset();
  },
  close: function() {
    this.callbackQueue.notifyAll();
  },
};

var TRANSACTION_WRAPPERS = [NESTED_UPDATES, UPDATE_QUEUEING];

// 以特定钩子重绘dirtyComponents中的各组件，清空dirtyComponents，或调用flushBatchedUpdates重绘新添加的脏组件
// 钩子包括ReactUpdatesFlushTransaction前后钩子，可添加组件重绘完成后的回调_pendingCallbacks
// 包括ReactReconcileTransaction前后钩子，可添加componentDidMount、componentDidUpdate回调
function ReactUpdatesFlushTransaction() {
  // 通过Transaction模块清空前后钩子
  this.reinitializeTransaction();
  // 脏组件个数，用于更新dirtyComponents中待重绘的脏组件 
  this.dirtyComponentsLength = null;
  // this.callbackQueue用于存储组件更新完成后的回调
  this.callbackQueue = CallbackQueue.getPooled();
  // ReactReconcileTransaction实例
  this.reconcileTransaction = ReactUpdates.ReactReconcileTransaction.getPooled(
    /* useCreateElement */ true,
  );
}

Object.assign(ReactUpdatesFlushTransaction.prototype, Transaction, {
  // 通过Transaction模块设定前置及后置钩子，[{initialize,close}]形式
  getTransactionWrappers: function() {
    return TRANSACTION_WRAPPERS;
  },

  // 清空ReactReconcileTransaction实例中的回调函数componentDidMount、componentDidUpdate
  // 清空CallbackQueue中的回调函数，再销毁this.reconcileTransaction
  destructor: function() {
    this.dirtyComponentsLength = null;
    CallbackQueue.release(this.callbackQueue);
    this.callbackQueue = null;
    ReactUpdates.ReactReconcileTransaction.release(this.reconcileTransaction);
    this.reconcileTransaction = null;
  },

  // 间接调用ReactReconcileTransaction实例的perform方法执行method，method为当前模块的runBatchedUpdates函数 
  // method执行前后既会调用ReactReconcileTransaction设定的钩子，也会调用ReactUpdatesFlushTransaction设定的钩子
  perform: function(method, scope, a) { // a为ReactReconcileTransaction实例
    // Essentially calls `this.reconcileTransaction.perform(method, scope, a)`
    // with this transaction's wrappers around it.
    return Transaction.perform.call(
      this,
      this.reconcileTransaction.perform,
      this.reconcileTransaction,
      method,
      scope,
      a,
    );
  },
});

// 通过PooledClass模块管理实例的创建ReactUpdatesFlushTransaction.getPooled
// 及实例数据的销毁ReactUpdatesFlushTransaction.release
PooledClass.addPoolingTo(ReactUpdatesFlushTransaction);

/**
 * ReactDefaultBatchingStrategy.isBatchingUpdates为否值时
 * 执行callback回调，并调用flushBatchedUpdates重绘dirtyComponents中脏组件
 * batchingStrategy.isBatchingUpdates为真值，只执行callback回调
 * 
 * @param {*} callback 
 * @param {DomComponent|CompositeComponent} a componentInstance
 * @param {DomElement} b container（dom节点）
 * @param {boolean} c shouldReuseMarkup
 * @param {Object} d context
 * @param {*} e 
 */
function batchedUpdates(callback, a, b, c, d, e) {
  ensureInjected();
  // ReactDefaultBatchingStrategy.isBatchingUpdates为否值时
  // 执行callback回调，并调用flushBatchedUpdates重绘dirtyComponents中脏组件
  // batchingStrategy.isBatchingUpdates为真值，只执行callback回调  
  return batchingStrategy.batchedUpdates(callback, a, b, c, d, e);
}

/**
 * Array comparator for ReactComponents by mount ordering.
 * 比较组件的挂载顺序
 *
 * @param {ReactComponent} c1 first component you're comparing
 * @param {ReactComponent} c2 second component you're comparing
 * @return {number} Return value usable by Array.prototype.sort().
 */
function mountOrderComparator(c1, c2) {
  return c1._mountOrder - c2._mountOrder;
}

function runBatchedUpdates(transaction) {
  var len = transaction.dirtyComponentsLength;
  invariant(
    len === dirtyComponents.length,
    "Expected flush transaction's stored dirty-components length (%s) to " +
      'match dirty-components array length (%s).',
    len,
    dirtyComponents.length,
  );

  // Since reconciling a component higher in the owner hierarchy usually (not
  // always -- see shouldComponentUpdate()) will reconcile children, reconcile
  // them before their children by sorting the array.
  dirtyComponents.sort(mountOrderComparator);

  // Any updates enqueued while reconciling must be performed after this entire
  // batch. Otherwise, if dirtyComponents is [A, B] where A has children B and
  // C, B could update twice in a single batch if C's render enqueues an update
  // to B (since B would have already updated, we should skip it, and the only
  // way we can know to do so is by checking the batch counter).
  updateBatchNumber++;

  for (var i = 0; i < len; i++) {
    // If a component is unmounted before pending changes apply, it will still
    // be here, but we assume that it has cleared its _pendingCallbacks and
    // that performUpdateIfNecessary is a noop.
    var component = dirtyComponents[i];

    // If performUpdateIfNecessary happens to enqueue any new updates, we
    // shouldn't execute the callbacks until the next render happens, so
    // stash the callbacks first
    var callbacks = component._pendingCallbacks;
    component._pendingCallbacks = null;

    var markerName;
    if (ReactFeatureFlags.logTopLevelRenders) {
      var namedComponent = component;
      // Duck type TopLevelWrapper. This is probably always true.
      if (component._currentElement.type.isReactTopLevelWrapper) {
        namedComponent = component._renderedComponent;
      }
      markerName = 'React update: ' + namedComponent.getName();
      console.time(markerName);
    }

    ReactReconciler.performUpdateIfNecessary(
      component,
      transaction.reconcileTransaction,
      updateBatchNumber,
    );

    if (markerName) {
      console.timeEnd(markerName);
    }

    if (callbacks) {
      for (var j = 0; j < callbacks.length; j++) {
        transaction.callbackQueue.enqueue(
          callbacks[j],
          component.getPublicInstance(),
        );
      }
    }
  }
}

var flushBatchedUpdates = function() {
  // ReactUpdatesFlushTransaction's wrappers will clear the dirtyComponents
  // array and perform any updates enqueued by mount-ready handlers (i.e.,
  // componentDidUpdate) but we need to check here too in order to catch
  // updates enqueued by setState callbacks and asap calls.
  while (dirtyComponents.length || asapEnqueued) {
    if (dirtyComponents.length) {
      var transaction = ReactUpdatesFlushTransaction.getPooled();
      transaction.perform(runBatchedUpdates, null, transaction);
      ReactUpdatesFlushTransaction.release(transaction);
    }

    if (asapEnqueued) {
      asapEnqueued = false;
      var queue = asapCallbackQueue;
      asapCallbackQueue = CallbackQueue.getPooled();
      queue.notifyAll();
      CallbackQueue.release(queue);
    }
  }
};

/**
 * Mark a component as needing a rerender, adding an optional callback to a
 * list of functions which will be executed once the rerender occurs.
 */
function enqueueUpdate(component) {
  ensureInjected();

  // Various parts of our code (such as ReactCompositeComponent's
  // _renderValidatedComponent) assume that calls to render aren't nested;
  // verify that that's the case. (This is called by each top-level update
  // function, like setState, forceUpdate, etc.; creation and
  // destruction of top-level components is guarded in ReactMount.)

  if (!batchingStrategy.isBatchingUpdates) {
    batchingStrategy.batchedUpdates(enqueueUpdate, component);
    return;
  }

  dirtyComponents.push(component);
  if (component._updateBatchNumber == null) {
    component._updateBatchNumber = updateBatchNumber + 1;
  }
}

/**
 * Enqueue a callback to be run at the end of the current batching cycle. Throws
 * if no updates are currently being performed.
 */
function asap(callback, context) {
  invariant(
    batchingStrategy.isBatchingUpdates,
    "ReactUpdates.asap: Can't enqueue an asap callback in a context where" +
      'updates are not being batched.',
  );
  asapCallbackQueue.enqueue(callback, context);
  asapEnqueued = true;
}

var ReactUpdatesInjection = {
  injectReconcileTransaction: function(ReconcileTransaction) {
    invariant(
      ReconcileTransaction,
      'ReactUpdates: must provide a reconcile transaction class',
    );
    ReactUpdates.ReactReconcileTransaction = ReconcileTransaction;
  },

  injectBatchingStrategy: function(_batchingStrategy) {
    invariant(
      _batchingStrategy,
      'ReactUpdates: must provide a batching strategy',
    );
    invariant(
      typeof _batchingStrategy.batchedUpdates === 'function',
      'ReactUpdates: must provide a batchedUpdates() function',
    );
    invariant(
      typeof _batchingStrategy.isBatchingUpdates === 'boolean',
      'ReactUpdates: must provide an isBatchingUpdates boolean attribute',
    );
    batchingStrategy = _batchingStrategy;
  },
};

var ReactUpdates = {
  /**
   * React references `ReactReconcileTransaction` using this property in order
   * to allow dependency injection.
   *
   * @internal
   */
  ReactReconcileTransaction: null,

  batchedUpdates: batchedUpdates,
  enqueueUpdate: enqueueUpdate,
  flushBatchedUpdates: flushBatchedUpdates,
  injection: ReactUpdatesInjection,
  asap: asap,
};

module.exports = ReactUpdates;
