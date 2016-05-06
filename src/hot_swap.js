(function (global, factory) {
  if (typeof module === "object" && typeof module.exports === "object") {
    module.exports = global.document ?
      factory(global) :
      function (global) {
        return factory(global);
      };
  } else {
    global.HotSwap = factory(global);
  }
}(typeof window !== "undefined" ? window : this, function (global) {
  'use strict';

  var document = global.document;
  var documentElement = document.documentElement;
  var history = global.history;

  function MutationManager() {
    if (!(this instanceof MutationManager)) return new MutationManager(); // factory-ify

    this.addedNodes = [];
    this.removedNodes = [];
  }

  MutationManager.prototype = {
    addedNodes: null,
    removedNodes: null,

    replaceNode: function (currentNode, replacementNode) {
      var parentNode = currentNode.parentNode;

      if (parentNode !== null) {
        parentNode.insertBefore(replacementNode, currentNode);
        parentNode.removeChild(currentNode);

        this.addedNodes.push(replacementNode);
        this.removedNodes.push(currentNode);
      } else {
        throw new Error('Cannot replace orphaned node');
      }
    },

    appendChildNodes: function (targetNode, sourceNode) {
      var sourceChildNode;

      while ((sourceChildNode = sourceNode.firstChild) !== null) {
        targetNode.appendChild(sourceChildNode);

        this.addedNodes.push(sourceChildNode);
      }
    },

    prependChildNodes: function (targetNode, sourceNode) {
      var targetReferenceNode = targetNode.firstChild;
      var sourceChildNode;

      if (targetReferenceNode !== null) {
        while ((sourceChildNode = sourceNode.firstChild) !== null) {
          targetNode.insertBefore(sourceChildNode, targetReferenceNode);

          this.addedNodes.push(sourceChildNode);
        }
      } else {
        this.appendChildNodes(targetNode, sourceNode);
      }
    },

    replaceChildNodes: function (targetNode, sourceNode) {
      var childNode;

      while ((childNode = targetNode.firstChild) !== null) {
        targetNode.removeChild(childNode);

        this.removedNodes.push(childNode);
      }

      this.appendChildNodes(targetNode, sourceNode);
    },

    collectAddedScriptElements: function() {
      var _push = Array.prototype.push;
      var addedNodes = this.addedNodes;
      var scriptElements = [];

      for(var index = 0, length = addedNodes.length, addedNode; index < length; index++) {
        addedNode = addedNodes[index];

        if(addedNode.tagName === 'SCRIPT') {
          scriptElements.push(addedNode);
        }

        _push.apply(scriptElements, addedNode.querySelectorAll('SCRIPT'));
      }

      return scriptElements;
    },

    executeAddedScriptElements: function() {
      var scriptElements = this.collectAddedScriptElements();

      for(var index = 0, length = scriptElements.length, scriptElement; index < length; index++) {
        scriptElement = scriptElements[index];

        this._executeScriptElement(scriptElement);
      }
    },

    _executeScriptElement: function(scriptElement) {
      var properScriptElement = document.createElement('SCRIPT');
      var attributes = scriptElement.attributes;

      for(var index = 0, length = attributes.length, attribute; index < length; index++) {
        attribute = attributes[index];

        if(scriptElement.hasAttribute(attribute.name)) {
          properScriptElement.setAttribute(attribute.name, attribute.value);
        }
      }

      var inlineBody = scriptElement.textContent;

      if(inlineBody.length > 0) {
        scriptElement.appendChild(document.createTextNode(inlineBody));
      }
    }
  };

  function HotSwap(options) {
    if (!(this instanceof HotSwap)) return new HotSwap(options); // factory-ify

    this._initializeOptions(options);
    this._initializeMutationManger();
    this._performMutation();
  }

  HotSwap.DEFAULT_OPTIONS = {
    title: function() {
      var titleNode = this.replacementDocument.querySelector('TITLE');

      if (titleNode) {
        return titleNode.textContent;
      }else{
        return document.title;
      }
    },
    url: function() {
      return document.location.href;
    },
    method: 'GET',
    data: null,
    replace: function() {
      if(this.getOption('replaceChildren') || this.getOption('appendChildren') || this.getOption('prependChildren')) {
        return false;
      }else{
        return 'BODY';
      }
    },
    replaceChildren: false,
    appendChildren: false,
    prependChildren: false,
    keepTitle: false,
    keepPath: false
  };

  HotSwap.createMutationManager = MutationManager;

  HotSwap.HTML_DOCUMENT_MIME_TYPE = 'text/html, application/xhtml+xml, application/xml';
  HotSwap.createRequestForHTML = function (method, url, data) {
    var request = new XMLHttpRequest();

    request.open(method, url, true);

    request.setRequestHeader('Accept', HotSwap.HTML_DOCUMENT_MIME_TYPE);
    request.setRequestHeader('X-XHR-Referer', document.location.href);

    request.send(data);

    return request;
  };

  HotSwap.PROPER_DOCUMENT_MATCHER = /<(html|body)/i;
  HotSwap.parseDocument = function (content, ownerDocument) {
    ownerDocument = ownerDocument || document;
    var documentElement = ownerDocument.createElement('HTML');

    if (HotSwap.PROPER_DOCUMENT_MATCHER.test(content)) {
      documentElement.innerHTML = content;
    } else {
      var headElement = ownerDocument.createElement('HEAD');
      var bodyElement = ownerDocument.createElement('BODY');
      documentElement.appendChild(headElement);
      documentElement.appendChild(bodyElement);

      bodyElement.innerHTML = content;
    }

    return documentElement;
  };

  HotSwap.EVENT_NAMESPACE = 'hot-swap';

  HotSwap.prototype = {
    options: null,
    _optionCache: null,
    _initializeOptions: function (options) {
      this._optionCache = {};
      this.options = options || {};
    },

    getOption: function(name) {
      if(!(name in this._optionCache)) {
        var option = this.options[name];

        if(typeof(option) === 'function') {
          option = option.call(this, this);
        }

        if(option !== false && !option) {
          option = HotSwap.DEFAULT_OPTIONS[name];
        }

        if(typeof(option) === 'function') {
          option = option.call(this, this);
        }

        this._optionCache[name] = option;
      }

      return this._optionCache[name];
    },

    _mutationManger: null,
    _initializeMutationManger: function () {
      this._mutationManger = HotSwap.createMutationManager();
    },
    getAddedNodes: function () {
      return this._mutationManger.addedNodes;
    },
    getRemovedNodes: function () {
      return this._mutationManger.removedNodes;
    },

    _performMutation: function () {
      if (this.getOption('content')) {
        this._performMutationFromLocalContent();
      } else {
        this._performMutationFromRemoteContent();
      }
    },

    request: null,
    _performMutationFromRemoteContent: function () {
      this._notifyDocument('before-load', function () {
        this.request = HotSwap.createRequestForHTML(this.getOption('method'), this.getOption('url'), this.getOption('data'));

        this.request.addEventListener('load', function () {
          this.replacementContent = this.request.responseText;

          this._notifyDocument('loaded', function () {
            this._performMutationFromLocalContent();
          });
        }.bind(this), false);

        this.request.addEventListener('error', function () {
          this._notifyDocument('load-error');
        }.bind(this), false);
      });
    },

    replacementContent: null,
    replacementDocument: null,
    _performMutationFromLocalContent: function () {
      this.replacementDocument = HotSwap.parseDocument(this.replacementContent);

      this._notifyDocument('before-mutation', function () {
        if (this.getOption('replace')) {
          this._replaceBySelector(this.getOption('replace'));
        }

        if (this.getOption('replaceChildren')) {
          this._replaceChildrenBySelector(this.getOption('replaceChildren'));
        }

        if (this.getOption('appendChildren')) {
          this._appendChildrenBySelector(this.getOption('appendChildren'));
        }

        if (this.getOption('prependChildren')) {
          this._prependChildrenBySelector(this.getOption('prependChildren'));
        }

        if (!this.getOption('keepTitle') && this.getOption('title')) {
          document.title = this.getOption('title');
        }

        if (!this.getOption('keepPath') && this.getOption('url')) {
          history.replaceState(history.state, document.title, this.getOption('url'));
        }

        this._mutationManger.executeAddedScriptElements();

        this._notifyDocument('mutated');
      });
    },

    _notifyDocument: function (name, notCancelledCallback) {
      var isCancelable = (typeof(notCancelledCallback) === 'function');
      var event = document.createEvent('Events');

      event.data = this;

      event.initEvent(HotSwap.EVENT_NAMESPACE + ':' + name, true, isCancelable);

      var wasCancelled = !document.dispatchEvent(event);

      if (isCancelable && !wasCancelled) {
        notCancelledCallback.call(this, event);
      }
    },

    _matchNodesBySelector: function (selector) {
      var matches = [];

      var currentNodes = documentElement.querySelectorAll(selector);
      var replacementNodes = this.replacementDocument.querySelectorAll(selector);

      if (currentNodes.length === replacementNodes.length) {
        for (var index = 0, length = currentNodes.length, currentNode, replacementNode; index < length; index++) {
          currentNode = currentNodes[index];
          replacementNode = replacementNodes[index];

          matches.push({
            currentNode: currentNode,
            replacementNode: replacementNode
          });
        }
      } else {
        throw new Error('Cannot match nodes by ambiguous selector: ' + selector);
      }

      return matches;
    },

    _replaceBySelector: function (selector) {
      var matches = this._matchNodesBySelector(selector);

      for (var index = 0, length = matches.length, match; index < length; index++) {
        match = matches[index];

        this._mutationManger.replaceNode(match.currentNode, match.replacementNode);
      }
    },

    _replaceChildrenBySelector: function (selector) {
      var matches = this._matchNodesBySelector(selector);

      for (var index = 0, length = matches.length, match; index < length; index++) {
        match = matches[index];

        this._mutationManger.replaceChildNodes(match.currentNode, match.replacementNode);
      }
    },

    _appendChildrenBySelector: function (selector) {
      var matches = this._matchNodesBySelector(selector);

      for (var index = 0, length = matches.length, match; index < length; index++) {
        match = matches[index];

        this._mutationManger.appendChildNodes(match.currentNode, match.replacementNode);
      }
    },

    _prependChildrenBySelector: function (selector) {
      var matches = this._matchNodesBySelector(selector);

      for (var index = 0, length = matches.length, match; index < length; index++) {
        match = matches[index];

        this._mutationManger.prependChildNodes(match.currentNode, match.replacementNode);
      }
    }
  };

  // DOM data attribute integration
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented) return;

    var link = event.target || event.srcElement;

    while (link && link.tagName !== 'A') {
      link = link.parentElement;
    }

    if (link && (link.hasAttribute('data-replace') ||
      link.hasAttribute('data-replace-children') ||
      link.hasAttribute('data-append-children') ||
      link.hasAttribute('data-prepend-children'))) {

      event.preventDefault();

      HotSwap({
        url: link.href,
        method: link.getAttribute('data-method'),
        replace: link.getAttribute('data-replace'),
        replaceChildren: link.getAttribute('data-replace-children'),
        appendChildren: link.getAttribute('data-append-children'),
        prependChildren: link.getAttribute('data-prepend-children'),
        keepTitle: link.hasAttribute('data-keep-title'),
        keepPath: link.hasAttribute('data-keep-path')
      });
    }
  }, false);

  document.addEventListener('submit', function (event) {
    if (event.defaultPrevented) return;

    var form = event.target || event.srcElement;

    while (form && form.tagName !== 'form') {
      form = form.parentElement;
    }

    if (form && (form.hasAttribute('data-replace') ||
      form.hasAttribute('data-replace-children') ||
      form.hasAttribute('data-append-children') ||
      form.hasAttribute('data-prepend-children'))) {

      event.preventDefault();

      HotSwap({
        url: form.action,
        method: form.method,
        data: new FormData(form),
        replace: form.getAttribute('data-replace'),
        replaceChildren: form.getAttribute('data-replace-children'),
        appendChildren: form.getAttribute('data-append-children'),
        prependChildren: form.getAttribute('data-prepend-children'),
        keepTitle: form.hasAttribute('data-keep-title'),
        keepPath: form.hasAttribute('data-keep-path')
      });
    }
  }, false);

  // jQuery cleanup integration
  if (typeof(global.jQuery) === 'function') {
    var $ = global.jQuery;

    document.addEventListener('hot-swap:mutated', function (event) {
      var hotSwap = event.data;

      if (hotSwap) {
        $(hotSwap.getRemovedNodes()).remove();
      }
    }, false);
  }

  // Turbolinks progress bar integration
  var isTurbolinksProgressBarIntegrationEnabled = false;
  HotSwap.enableTurbolinksProgressBarIntegration = function () {
    if (global.Turbolinks) {
      if (!isTurbolinksProgressBarIntegrationEnabled) {
        var Turbolinks = global.Turbolinks;
        var requestDepth = 0;

        var requestStarted = function () {
          if (requestDepth++ === 0) {
            Turbolinks.ProgressBar.start();
          }
        };

        var requestFinished = function () {
          if (--requestDepth === 0) {
            Turbolinks.ProgressBar.done();
          }
        };

        document.addEventListener('hot-swap:before-load', requestStarted, false);
        document.addEventListener('hot-swap:loaded', requestFinished, false);
        document.addEventListener('hot-swap:load-error', requestFinished, false);

        isTurbolinksProgressBarIntegrationEnabled = true;

        return true;
      } else {
        return false;
      }
    } else {
      throw new Error('Turbolinks not found');
    }
  };

  return HotSwap;
}));