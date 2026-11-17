/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-7e5eb42b'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "registerSW.js",
    "revision": "1872c500de691dce40960bb85481de07"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "8171ba79fc07b4a60071c682577b6c06"
  }, {
    "url": "pwa-512x512.png",
    "revision": "8171ba79fc07b4a60071c682577b6c06"
  }, {
    "url": "pwa-192x192.png",
    "revision": "fa8243506904d853457c70dd320f4813"
  }, {
    "url": "index.html",
    "revision": "4a3ae149562dc2307ba2b770d068f2ca"
  }, {
    "url": "icon.svg",
    "revision": "614ac7bffef854645ba9612d2f124bf3"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "de85ba672ba455216e86a129b6bec7dc"
  }, {
    "url": "assets/index-D-q3JI9C.css",
    "revision": null
  }, {
    "url": "assets/index-CJ8DAVl8.js",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "de85ba672ba455216e86a129b6bec7dc"
  }, {
    "url": "icon.svg",
    "revision": "614ac7bffef854645ba9612d2f124bf3"
  }, {
    "url": "pwa-192x192.png",
    "revision": "fa8243506904d853457c70dd320f4813"
  }, {
    "url": "pwa-512x512.png",
    "revision": "8171ba79fc07b4a60071c682577b6c06"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "8171ba79fc07b4a60071c682577b6c06"
  }, {
    "url": "manifest.webmanifest",
    "revision": "b03c12d192622cd5458c32410ce37a72"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//, /^\/downloads\//, /^\/pyodide\//]
  }));

}));
