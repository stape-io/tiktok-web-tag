const addConsentListener = require('addConsentListener');
const callInWindow = require('callInWindow');
const copyFromDataLayer = require('copyFromDataLayer');
const copyFromWindow = require('copyFromWindow');
const createQueue = require('createQueue');
const encodeUriComponent = require('encodeUriComponent');
const getTimestampMillis = require('getTimestampMillis');
const getType = require('getType');
const injectScript = require('injectScript');
const isConsentGranted = require('isConsentGranted');
const JSON = require('JSON');
const localStorage = require('localStorage');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const makeTableMap = require('makeTableMap');
const Object = require('Object');
const setInWindow = require('setInWindow');
const sha256 = require('sha256');
const templateStorage = require('templateStorage');

// Call-once methods.
let gtmOnSuccess = () => {
  gtmOnSuccess = () => {};
  return data.gtmOnSuccess();
};

let gtmOnFailure = () => {
  gtmOnFailure = () => {};
  return data.gtmOnFailure();
};

/*==============================================================================
==============================================================================*/

const PARTNER_NAME = 'stape_gtm_1_2_0';
const queueName = 'ttq';

const queue = getOrCreateTikTokQueue(queueName);

const isConsentExplicitlyRevokedAndNotOptInMode =
  data.consentOptMode !== 'optin' &&
  (data.enableGoogleConsentMode
    ? !isConsentGranted('ad_storage')
    : isUIConsentFieldDenied(data.consent));
if (isConsentExplicitlyRevokedAndNotOptInMode) {
  // Only adds .revokeConsent if the queue was already taken over by SDK.
  // Otherwise (not taken over yet), .track/.identify commands collect prior to consent granted will be executed when calling .load and .grantConsent.
  const queueWasTakenOverBySDK = queue && (queue.initialize || queue._mounted);
  if (queueWasTakenOverBySDK) {
    callInWindow(queueName + '.revokeConsent');
  }

  return gtmOnSuccess();
}

setConsent(data, queueName);
sendEvent(data, queueName);

/*==============================================================================
  Vendor related functions
==============================================================================*/

function getOrCreateTikTokQueue(queueName) {
  const existingQueue = copyFromWindow(queueName);
  if (existingQueue) return existingQueue;

  setInWindow('TiktokAnalyticsObject', queueName);
  const newQueue = [];

  // prettier-ignore
  newQueue.methods = ['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie','holdConsent','revokeConsent','grantConsent'];

  // "pixelId" parameter is not present in the original method.
  // We need it to determine which queue to be used during the execution of the inner function.
  newQueue.setAndDefer = (queue, command, pixelId) => {
    // Do not use arrow function here to avoid problems with 'arguments'.
    queue[command] = function () {
      const currentQueue = copyFromWindow(queueName);
      const currentPixelQueue = pixelId
        ? (currentQueue._i[pixelId] = currentQueue._i[pixelId] || [])
        : undefined;
      (pixelId ? currentPixelQueue : currentQueue).push(
        [command].concat(convertArgumentstoArray(arguments))
      );
      if (pixelId) setInWindow(queueName + '._i', currentQueue._i, true);
      else setInWindow(queueName, currentQueue, true);
    };
  };

  newQueue.methods.forEach((method) => newQueue.setAndDefer(newQueue, method));

  newQueue.instance = (pixelId) => {
    const _i = copyFromWindow(queueName + '._i');
    const currentPixelQueue = (_i[pixelId] = _i[pixelId] || []);
    newQueue.methods.forEach((method) => newQueue.setAndDefer(currentPixelQueue, method, pixelId));
    setInWindow(queueName + '._i', _i, true);
    return currentPixelQueue;
  };

  newQueue.load = (pixelId, options, asyncScriptLoadManagerStorageConfig) => {
    const scriptBaseUrl = 'https://analytics.tiktok.com/i18n/pixel/events.js';
    const scriptUrl = scriptBaseUrl + '?sdkid=' + encodeUriComponent(pixelId) + '&lib=' + queueName;

    const _i = copyFromWindow(queueName + '._i') || {};
    _i[pixelId] = [];
    _i[pixelId]._u = scriptBaseUrl;
    setInWindow(queueName + '._i', _i, true);

    const _t = copyFromWindow(queueName + '._t') || {};
    _t[pixelId] = getTimestampMillis();
    setInWindow(queueName + '._t', _t, true);

    const _o = copyFromWindow(queueName + '._o') || {};
    _o[pixelId] = options || {};
    setInWindow(queueName + '._o', _o, true);

    let asyncManager;
    if (
      getType(asyncScriptLoadManagerStorageConfig) === 'object' &&
      asyncScriptLoadManagerStorageConfig.key
    ) {
      asyncManager = getAsyncScriptLoadManager(asyncScriptLoadManagerStorageConfig.key);
      asyncManager.addPendingCall();
    }

    injectScript(
      scriptUrl,
      () => {
        if (asyncManager) asyncManager.completeCall();
      },
      () => {
        if (asyncManager) {
          asyncManager.markFailed();
          asyncManager.completeCall();
        }
      },
      'ttqPixel-' + pixelId
    );
  };

  setInWindow(queueName, newQueue, true);
  return newQueue;
}

function deferUntilGoogleConsentGranted(isConsentGranted, callback) {
  if (isConsentGranted) {
    callback();
    return;
  }

  const callbacksKey = 'ttq_consent_callbacks_ad_storage';
  const callbacks = templateStorage.getItem(callbacksKey) || [];
  callbacks.push(callback);
  templateStorage.setItem(callbacksKey, callbacks);

  const listenerAddedKey = 'ttq_consent_listener_added_ad_storage';
  if (!templateStorage.getItem(listenerAddedKey)) {
    templateStorage.setItem(listenerAddedKey, true);
    addConsentListener('ad_storage', (type, granted) => {
      if (type !== 'ad_storage' || !granted) return;
      const queuedCallbacks = templateStorage.getItem(callbacksKey) || [];
      templateStorage.setItem(callbacksKey, []);
      queuedCallbacks.forEach((cb) => cb());
    });
  }
}

function setConsent(data, queueName) {
  if (data.enableGoogleConsentMode) {
    if (data.consentOptMode === 'optin' && !isTrackingPermitted(data)) {
      callInWindow(queueName + '.holdConsent');
    }

    deferUntilGoogleConsentGranted(isTrackingPermitted(data), () => {
      callInWindow(queueName + '.grantConsent');
    });
  } else {
    // Manual consent
    if (!isTrackingPermitted(data)) {
      callInWindow(queueName + '.holdConsent');
    } else {
      callInWindow(queueName + '.grantConsent');
    }
  }
}

function getLoadOptions(data) {
  const loadOptions = {};
  if (data.disableHistoryObserver) loadOptions.historyObserver = false;
  if (data.enableLDU && data.modeLDU === 'all') loadOptions.limited_data_use = true;
  return loadOptions;
}

function getEventName(data) {
  if (data.eventNameSetupMethod === 'inherit') {
    const eventName = copyFromDataLayer('event');

    const ga4ToTikTokEventName = {
      page_view: 'Pageview',
      'gtm.dom': 'Pageview',
      add_payment_info: 'AddPaymentInfo',
      add_to_cart: 'AddToCart',
      add_to_wishlist: 'AddToWishlist',
      sign_up: 'CompleteRegistration',
      begin_checkout: 'InitiateCheckout',
      generate_lead: 'Lead',
      purchase: 'Purchase',
      search: 'Search',
      view_item: 'ViewContent',

      contact: 'Contact',
      customize_product: 'CustomizeProduct',
      donate: 'Donate',
      find_location: 'FindLocation',
      schedule: 'Schedule',
      start_trial: 'StartTrial',
      submit_application: 'SubmitApplication',
      subscribe: 'Subscribe',

      page_view_stape: 'Pageview',
      add_payment_info_stape: 'AddPaymentInfo',
      add_to_cart_stape: 'AddToCart',
      sign_up_stape: 'CompleteRegistration',
      begin_checkout_stape: 'InitiateCheckout',
      purchase_stape: 'Purchase',
      view_item_stape: 'ViewContent',

      'gtm4wp.addProductToCartEEC': 'AddToCart',
      'gtm4wp.productClickEEC': 'ViewContent',
      'gtm4wp.checkoutOptionEEC': 'InitiateCheckout',
      'gtm4wp.checkoutStepEEC': 'AddPaymentInfo',
      'gtm4wp.orderCompletedEEC': 'Purchase'
    };

    return ga4ToTikTokEventName[eventName] || eventName;
  }

  return data.eventName === 'standard' ? data.eventNameStandard : data.eventNameCustom;
}

function pushEventIdToDataLayer(data) {
  if (!data.pushEventIdToDataLayer) return;

  const dataLayerQueueName = data.eventIdDataLayerVariableName || 'dataLayer';
  const dataLayerPush = createQueue(dataLayerQueueName);
  dataLayerPush({
    eventId: data.eventId,
    event: data.eventIdDataLayerEventName || 'tiktokPixelDataLayerPush'
  });
}

function getEventUserDataEnhancement(canInteractWithStorage) {
  if (!canInteractWithStorage || !localStorage) return {};

  const gtmeec = localStorage.getItem('gtmeec-tt');
  if (gtmeec) {
    const gtmeecParsed = JSON.parse(gtmeec);
    if (getType(gtmeecParsed) === 'object') return gtmeecParsed;
  }

  return {};
}

function normalizeBasedOnSchemaKey(schemaKey, identifier) {
  switch (schemaKey) {
    case 'phone_number':
      return normalizePhoneNumber(identifier);
    case 'email':
      return normalizeEmail(identifier);
    case 'external_id':
      return removeWhiteSpace(identifier);
    default:
      return identifier;
  }
}

function hashUserDataFields(userData, storeUserDataInLocalStorage) {
  const canUseHashSync = getType(copyFromWindow('dataTag256')) === 'function';
  const hashAsyncHelpers = {
    pendingHashs: 0,
    maybeFinish: (userDataHashed) => {
      if (hashAsyncHelpers.pendingHashs === 0) storeUserDataInLocalStorage(userDataHashed);
    }
  };

  const userDataHashed = {};

  const fieldNames = Object.keys(userData);
  fieldNames.forEach((fieldName) => {
    const value = userData[fieldName];

    if (value === undefined || value === null || value === '') return;
    if (isHashed(value)) {
      userDataHashed[fieldName] = value;
      return;
    }

    const normalizedValue = makeString(normalizeBasedOnSchemaKey(fieldName, value)).trim();
    if (canUseHashSync) {
      userDataHashed[fieldName] = callInWindow('dataTag256', normalizedValue, 'HEX');
    } else {
      hashAsyncHelpers.pendingHashs++;
      sha256(
        normalizedValue,
        (digest) => {
          userDataHashed[fieldName] = digest;
          hashAsyncHelpers.pendingHashs--;
          hashAsyncHelpers.maybeFinish(userDataHashed);
        },
        () => {
          hashAsyncHelpers.pendingHashs--;
        },
        { outputEncoding: 'hex' }
      );
    }
  });

  if (canUseHashSync) {
    storeUserDataInLocalStorage(userDataHashed);
    return userDataHashed;
  } else {
    hashAsyncHelpers.maybeFinish(userDataHashed);
    return;
  }
}

function storeUserDataInLocalStorage(userData) {
  if (!localStorage || !objHasProps(userData)) return;

  const gtmeec = JSON.stringify(userData);
  localStorage.setItem('gtmeec-tt', gtmeec);
}

function storeEventUserDataEnhancement(data, canInteractWithStorage, userData) {
  if (!canInteractWithStorage || !localStorage || !objHasProps(userData)) return;

  if (!data.storeUserDataHashed) storeUserDataInLocalStorage(userData);
  else hashUserDataFields(userData, storeUserDataInLocalStorage);
}

function addUserData(userData, userDataFrom, useDL) {
  let email =
    userDataFrom.email ||
    userDataFrom.sha256_email_address ||
    userDataFrom.email_address ||
    userDataFrom.em;
  const emailType = getType(email);
  if (emailType === 'array' || emailType === 'object') email = email[0];
  if (email) userData.email = email;

  let phone =
    userDataFrom.phone ||
    userDataFrom.sha256_phone_number ||
    userDataFrom.phone_number ||
    userDataFrom.ph;
  const phoneType = getType(phone);
  if (phoneType === 'array' || phoneType === 'object') phone = phone[0];
  if (phone) userData.phone_number = phone;

  if (userDataFrom.external_id) userData.external_id = userDataFrom.external_id;
  else if (userDataFrom.user_id) userData.external_id = userDataFrom.user_id;
  else if (userDataFrom.userId) userData.external_id = userDataFrom.userId;
  else if (useDL && copyFromDataLayerWithVersion('external_id'))
    userData.external_id = copyFromDataLayerWithVersion('external_id');
  else if (useDL && copyFromDataLayerWithVersion('user_id'))
    userData.external_id = copyFromDataLayerWithVersion('user_id');
  else if (useDL && copyFromDataLayerWithVersion('userId'))
    userData.external_id = copyFromDataLayerWithVersion('userId');

  return userData;
}

function isTrackingPermitted(data) {
  if (data.enableGoogleConsentMode) {
    return isConsentGranted('ad_storage');
  } else {
    // Manual consent
    return (
      data.consentOptMode !== 'optin' ||
      (data.consentOptMode === 'optin' && isUIConsentFieldGranted(data.consent))
    );
  }
}

function getUserData(data) {
  if (!data.enableAdvancedMatching) return;

  const canInteractWithStorage = isTrackingPermitted(data);
  let userData = {};

  if (data.enableEventUserDataEnhancement) {
    userData = getEventUserDataEnhancement(canInteractWithStorage);
  }

  if (data.enableDataLayerMapping) {
    const userDataFromDataLayer = copyFromDataLayerWithVersion('user_data');
    if (getType(userDataFromDataLayer) === 'object') {
      addUserData(userData, userDataFromDataLayer, true);
    }
  }

  if (getType(data.userDataFromVariable) === 'object') {
    addUserData(userData, data.userDataFromVariable, false);
  }

  if (data.userDataList && data.userDataList.length) {
    mergeObj(userData, makeTableMap(data.userDataList, 'name', 'value'));
  }

  if (objIsEmptyOrContainsOnlyFalsyValues(userData)) return;

  if (data.enableEventUserDataEnhancement) {
    storeEventUserDataEnhancement(data, canInteractWithStorage, userData);
  }

  return userData;
}

function addUAEventParameters(eventName, eventParameters, ecommerce) {
  const eventActionMap = {
    ViewContent: 'detail',
    AddToCart: 'add',
    InitiateCheckout: 'checkout',
    Purchase: 'purchase'
  };

  if (eventActionMap[eventName]) {
    const action = eventActionMap[eventName];
    const hasActionObject = getType(ecommerce[action]) === 'object';
    const hasActionFieldObject =
      hasActionObject && getType(ecommerce[action].actionField) === 'object';
    let valueFromItems = 0;

    if (
      hasActionObject &&
      getType(ecommerce[action].products) === 'array' &&
      ecommerce[action].products.length
    ) {
      eventParameters.contents = [];
      eventParameters.content_ids = [];
      eventParameters.content_type = 'product';
      eventParameters.num_items = 0;

      ecommerce[action].products.forEach((d) => {
        const content = {};
        if (d.id) content.content_id = makeString(d.id);
        content.quantity = makeNumber(d.quantity) || 1;
        if (d.price) {
          const price = makeNumber(d.price);
          valueFromItems += content.quantity ? content.quantity * price : price;
          content.price = price;
        }
        if (d.category) content.content_category = makeString(d.category);
        if (d.name) content.content_name = makeString(d.name);
        if (d.brand) content.brand = makeString(d.brand);

        eventParameters.contents.push(content);
        eventParameters.num_items += content.quantity || 1;
        eventParameters.content_ids.push(content.content_id);
      });
    }

    const value =
      (hasActionFieldObject && ecommerce[action].actionField.revenue
        ? ecommerce[action].actionField.revenue
        : undefined) || valueFromItems;
    if (value) eventParameters.value = makeNumber(value);

    const currency = ecommerce.currencyCode;
    if (currency) eventParameters.currency = ecommerce.currencyCode;

    if (eventName === 'Purchase') {
      const orderId = hasActionFieldObject ? ecommerce[action].actionField.id : undefined;
      if (orderId) eventParameters.order_id = orderId;
    }
  }

  return eventParameters;
}

function addGA4EventParameters(eventName, eventParameters, ecommerce) {
  const items = copyFromDataLayerWithVersion('items') || ecommerce.items;
  let currencyFromItems = '';
  let valueFromItems = 0;

  if (getType(items) === 'array' && items.length) {
    eventParameters.contents = [];
    eventParameters.content_ids = [];
    eventParameters.content_type = 'product';
    eventParameters.num_items = 0;
    currencyFromItems = items[0].currency;

    items.forEach((d) => {
      const content = {};
      if (d.item_id) content.content_id = makeString(d.item_id);
      content.quantity = makeNumber(d.quantity) || 1;

      if (d.price) {
        const price = makeNumber(d.price);
        valueFromItems += content.quantity ? content.quantity * price : price;
        content.price = price;
      }

      const contentCategories = [];
      if (d.item_category) contentCategories.push(makeString(d.item_category));
      if (d.item_category2) contentCategories.push(makeString(d.item_category2));
      if (d.item_category3) contentCategories.push(makeString(d.item_category3));
      if (d.item_category4) contentCategories.push(makeString(d.item_category4));
      if (d.item_category5) contentCategories.push(makeString(d.item_category5));
      if (contentCategories.length) content.content_category = contentCategories.join(',');

      if (d.item_name) content.content_name = makeString(d.item_name);
      if (d.item_brand) content.brand = makeString(d.item_brand);

      eventParameters.contents.push(content);
      eventParameters.num_items += content.quantity || 1;
      eventParameters.content_ids.push(content.content_id);
    });
  }

  const value = ecommerce.value || valueFromItems || copyFromDataLayerWithVersion('value');
  if (value) eventParameters.value = makeNumber(value);

  const currency =
    ecommerce.currency || currencyFromItems || copyFromDataLayerWithVersion('currency');
  if (currency) eventParameters.currency = currency;

  if (eventName === 'Purchase') {
    const orderId = ecommerce.transaction_id || copyFromDataLayerWithVersion('transaction_id');
    if (orderId) eventParameters.order_id = orderId;
  }

  const searchTerm = copyFromDataLayerWithVersion('search_term');
  if (searchTerm) eventParameters.search_string = makeString(searchTerm);

  return eventParameters;
}

function getEventParameters(data, eventName) {
  const eventParameters = {
    gtm_version: PARTNER_NAME,
    event_trigger_source: 'GoogleTagManagerClient'
  };

  if (data.enableLDU && data.modeLDU === 'single') eventParameters.limited_data_use = true;

  if (data.enableDataLayerMapping) {
    let ecommerceObjFromDataLayer = copyFromDataLayerWithVersion('ecommerce');
    if (getType(ecommerceObjFromDataLayer) !== 'object') {
      ecommerceObjFromDataLayer = {};
    }

    addGA4EventParameters(eventName, eventParameters, ecommerceObjFromDataLayer);

    if (!eventParameters.content_type) {
      addUAEventParameters(eventName, eventParameters, ecommerceObjFromDataLayer);
    }
  }

  if (getType(data.eventParametersFromVariable) === 'object') {
    mergeObj(eventParameters, data.eventParametersFromVariable);
  }

  if (data.eventParametersList && data.eventParametersList.length) {
    mergeObj(eventParameters, makeTableMap(data.eventParametersList, 'name', 'value'));
  }

  if (getType(data.additionalEventParametersFromVariable) === 'object') {
    mergeObj(eventParameters, data.additionalEventParametersFromVariable);
  }

  if (data.additionalEventParametersList && data.additionalEventParametersList.length) {
    mergeObj(eventParameters, makeTableMap(data.additionalEventParametersList, 'name', 'value'));
  }

  return eventParameters;
}

function sendEvent(data, queueName) {
  let pixelIds = getType(data.pixelIds) === 'string' ? data.pixelIds.split(',') : data.pixelIds;
  if (getType(pixelIds) === 'array') {
    pixelIds = pixelIds.map((p) => makeString(p).trim()).filter((p) => p);
  }
  if (getType(pixelIds) !== 'array' || pixelIds.length === 0) return gtmOnFailure();

  const initializedPixelIds = copyFromWindow('_tiktok_gtm_ids') || {};
  const loadOptions = getLoadOptions(data);
  const userData = getUserData(data);
  let identifyWasNotCalled = true;
  const eventName = getEventName(data);
  const eventParameters = getEventParameters(data, eventName);

  const asyncManager = initAsyncScriptLoadManager(data);

  pixelIds.forEach((pixelId) => {
    const pixelIdIsNotInitialized = !initializedPixelIds[pixelId];

    if (pixelIdIsNotInitialized) {
      const loadPixel = () => {
        const asyncScriptLoadManagerStorageConfig = {
          key: asyncManager.key
        };
        callInWindow(
          queueName + '.load',
          pixelId,
          loadOptions,
          asyncScriptLoadManagerStorageConfig
        );
      };

      let willLoad = false;
      if (data.enableGoogleConsentMode) {
        willLoad = true;
        deferUntilGoogleConsentGranted(isTrackingPermitted(data), () => loadPixel());
      } else if (isTrackingPermitted(data)) {
        // Manual consent
        willLoad = true;
        loadPixel();
      }

      if (willLoad) {
        initializedPixelIds[pixelId] = true;
        setInWindow('_tiktok_gtm_ids', initializedPixelIds, true);
      }
    }

    if (identifyWasNotCalled && objHasProps(userData)) {
      identifyWasNotCalled = false;
      callInWindow(queueName + '.identify', userData);
    }

    callInWindow(queueName + '.track', eventName, eventParameters, {
      event_id: data.eventId,
      pixel_code: pixelId // Ensures the event is sent to this "pixelId" only.
    });
  });

  pushEventIdToDataLayer(data);

  if (!asyncManager.hasPendingCalls()) {
    asyncManager.clear();
    return gtmOnSuccess();
  }
}

/*==============================================================================
  Helpers
==============================================================================*/

/**
 * The helper object is used to handle multiple asynchronous script injections.
 * It ensures that the tag execution status is reported only after all scripts have finished loading.
 */
function getAsyncScriptLoadManager(key) {
  return {
    key: key,
    addPendingCall: () => {
      const manager = templateStorage.getItem(key);
      if (getType(manager) === 'object') {
        manager.pendingInjectScriptCalls++;
        templateStorage.setItem(key, manager);
      }
    },
    hasPendingCalls: () => {
      const manager = templateStorage.getItem(key);
      return getType(manager) === 'object' && manager.pendingInjectScriptCalls > 0;
    },
    markFailed: () => {
      const manager = templateStorage.getItem(key);
      if (getType(manager) === 'object') {
        manager.someFailed = true;
        templateStorage.setItem(key, manager);
      }
    },
    completeCall: () => {
      const manager = templateStorage.getItem(key);
      if (getType(manager) === 'object') {
        manager.pendingInjectScriptCalls--;
        if (manager.pendingInjectScriptCalls <= 0) {
          templateStorage.removeItem(key);
          return manager.someFailed ? manager.onFailure() : manager.onSuccess();
        }
        templateStorage.setItem(key, manager);
      }
    },
    clear: () => {
      templateStorage.removeItem(key);
    }
  };
}

function initAsyncScriptLoadManager(data) {
  const tagExecutionId = data.gtmTagId + '-' + data.gtmEventId + '-' + getTimestampMillis();
  const key = 'asyncScriptLoadManager-' + tagExecutionId;
  templateStorage.setItem(key, {
    pendingInjectScriptCalls: 0,
    someFailed: false,
    onSuccess: data.gtmOnSuccess,
    onFailure: data.gtmOnFailure
  });
  return getAsyncScriptLoadManager(key);
}

function convertArgumentstoArray(args) {
  const argumentsAsArray = [];
  for (let i = 0; i < args.length; i++) argumentsAsArray.push(args[i]);
  return argumentsAsArray;
}

function isUIConsentFieldGranted(field) {
  return [true, 'true', 1, '1', 'granted'].indexOf(field) !== -1;
}

function isUIConsentFieldDenied(field) {
  return [false, 'false', 0, '0', 'denied'].indexOf(field) !== -1;
}

function objHasProps(obj) {
  return getType(obj) === 'object' && Object.keys(obj).length > 0;
}

function objIsEmptyOrContainsOnlyFalsyValues(obj) {
  if (getType(obj) !== 'object') return;
  const objValues = Object.values(obj);
  if (objValues.length === 0 || objValues.every((v) => !v)) return true;
}

function mergeObj(target, source) {
  for (const key in source) {
    if (source.hasOwnProperty(key)) target[key] = source[key];
  }
  return target;
}

function isHashed(value) {
  if (!value) return false;
  return makeString(value).match('^[A-Fa-f0-9]{64}$') !== null;
}

function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return;
  phoneNumber = makeString(phoneNumber)
    .split('+')
    .join('')
    .split(' ')
    .join('')
    .split('-')
    .join('')
    .split('(')
    .join('')
    .split(')')
    .join('');
  if (phoneNumber[0] !== '+') phoneNumber = '+' + phoneNumber;
  return phoneNumber;
}

function normalizeEmail(email) {
  if (!email) return;
  return removeWhiteSpace(makeString(email)).toLowerCase();
}

function removeWhiteSpace(input) {
  if (!input) return;
  return makeString(input).split(' ').join('');
}

function copyFromDataLayerWithVersion(key) {
  const dataLayerVersion = data.enableMostRecentDataLayerEventOnly ? 1 : 2;
  return copyFromDataLayer(key, dataLayerVersion);
}
