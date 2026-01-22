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

/*==============================================================================
==============================================================================*/

const queueName = 'ttq';
getOrCreateTikTokQueue(queueName);
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
    queue[command] = () => {
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

    let asyncScriptLoadManager;
    if (
      getType(asyncScriptLoadManagerStorageConfig) === 'object' &&
      asyncScriptLoadManagerStorageConfig.asyncScriptLoadManagerStorageKey
    ) {
      const asyncScriptLoadManagerStorageKey =
        asyncScriptLoadManagerStorageConfig.asyncScriptLoadManagerStorageKey;
      asyncScriptLoadManager = templateStorage.getItem(asyncScriptLoadManagerStorageKey);
      if (getType(asyncScriptLoadManager) === 'object') {
        asyncScriptLoadManager.pendingInjectScriptCalls += 1;
        templateStorage.setItem(asyncScriptLoadManagerStorageKey, asyncScriptLoadManager);
      }
    }

    injectScript(
      scriptUrl,
      () => {
        if (getType(asyncScriptLoadManager) === 'object') {
          asyncScriptLoadManager.maybeCallTagExecutionHandler();
        }
      },
      () => {
        if (getType(asyncScriptLoadManager) === 'object') {
          asyncScriptLoadManager.someFailed = true;
          asyncScriptLoadManager.maybeCallTagExecutionHandler();
        }
      },
      'ttqPixel-' + pixelId
    );
  };

  setInWindow(queueName, newQueue, true);
}

function setConsent(data, queueName) {
  if (data.enableGoogleConsentMode) {
    if (!isConsentGranted('ad_storage')) {
      callInWindow(queueName + '.revokeConsent');

      let wasCalled = false;
      addConsentListener('ad_storage', (consentType, granted) => {
        if (wasCalled || consentType !== 'ad_storage' || !granted) return;
        wasCalled = true;
        callInWindow(queueName + '.grantConsent');
      });
    } else {
      callInWindow(queueName + '.grantConsent');
    }

    return;
  }

  if (data.consentOptMode === 'optin') callInWindow(queueName + '.holdConsent');
  if (isUIConsentFieldGranted(data.consent)) callInWindow(queueName + '.grantConsent');
  else if (isUIConsentFieldDenied(data.consent)) callInWindow(queueName + '.revokeConsent');
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

function getEventUserDataEnhancement() {
  if (localStorage) {
    const gtmeec = localStorage.getItem('gtmeec-tt');
    if (gtmeec) {
      const gtmeecParsed = JSON.parse(gtmeec);
      if (getType(gtmeecParsed) === 'object') return gtmeecParsed;
    }
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
  if (!objHasProps(userData)) return;
  const gtmeec = JSON.stringify(userData);
  localStorage.setItem('gtmeec-tt', gtmeec);
}

function storeEventUserDataEnhancement(data, userData) {
  if (localStorage && objHasProps(userData)) {
    if (!data.storeUserDataHashed) storeUserDataInLocalStorage(userData);
    else hashUserDataFields(userData, storeUserDataInLocalStorage);
  }
}

function addUserData(userData, userDataFrom, useDL) {
  let email =
    userDataFrom.email ||
    userDataFrom.sha256_email_address ||
    userDataFrom.email_address ||
    userDataFrom.email ||
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

function getUserData(data) {
  if (!data.enableAdvancedMatching) return;

  let userData = {};

  if (data.enableEventUserDataEnhancement) {
    userData = getEventUserDataEnhancement();
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
    storeEventUserDataEnhancement(data, userData);
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
    let valueFromItems = 0;

    if (
      getType(ecommerce[action]) === 'object' &&
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
      (getType(ecommerce[action].actionField) === 'object' && ecommerce[action].actionField.revenue
        ? ecommerce[action].actionField.revenue
        : undefined) || valueFromItems;
    if (value) eventParameters.value = makeNumber(value);

    const currency = ecommerce.currencyCode;
    if (currency) eventParameters.currency = ecommerce.currencyCode;
  }

  return eventParameters;
}

function addGA4EventParameters(eventParameters, ecommerce) {
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

  const searchTerm = copyFromDataLayerWithVersion('search_term');
  if (searchTerm) eventParameters.search_string = makeString(searchTerm);

  return eventParameters;
}

function getEventParameters(data, eventName) {
  const eventParameters = {
    gtm_version: 'stape_gtm_1_0_1',
    event_trigger_source: 'GoogleTagManagerClient'
  };

  if (data.enableLDU && data.modeLDU === 'single') eventParameters.limited_data_use = true;

  if (data.enableDataLayerMapping) {
    let ecommerceObjFromDataLayer = copyFromDataLayerWithVersion('ecommerce');
    if (getType(ecommerceObjFromDataLayer) !== 'object') {
      ecommerceObjFromDataLayer = {};
    }

    addGA4EventParameters(eventParameters, ecommerceObjFromDataLayer);

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

  if (getType(data.eventCustomParametersFromVariable) === 'object') {
    mergeObj(eventParameters, data.eventCustomParametersFromVariable);
  }

  if (data.eventCustomParametersList && data.eventCustomParametersList.length) {
    mergeObj(eventParameters, makeTableMap(data.eventCustomParametersList, 'name', 'value'));
  }

  return eventParameters;
}

function sendEvent(data, queueName) {
  const pixelIds = getType(data.pixelIds) === 'string' ? data.pixelIds.split(',') : data.pixelIds;
  if (getType(pixelIds) !== 'array' || pixelIds.length === 0) return data.gtmOnFailure();

  const initializedPixelIds = copyFromWindow('_tiktok_gtm_ids') || {};
  let loadWasNotCalled = true;
  const loadOptions = getLoadOptions(data);
  const userData = getUserData(data);
  let identifyWasNotCalled = true;
  const eventName = getEventName(data);
  const eventParameters = getEventParameters(data, eventName);

  const asyncScriptLoadManagerStorageKey = setAsyncScriptLoadManager(data);

  pixelIds.forEach((pixelId) => {
    const pixelIdIsNotInitialized = !initializedPixelIds[pixelId];
    if (pixelIdIsNotInitialized) {
      initializedPixelIds[pixelId] = true;
      loadWasNotCalled = false;
      setInWindow('_tiktok_gtm_ids', initializedPixelIds, true);
      callInWindow(queueName + '.load', pixelId, loadOptions, {
        asyncScriptLoadManagerStorageKey: asyncScriptLoadManagerStorageKey
      });
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

  if (loadWasNotCalled) {
    templateStorage.removeItem(asyncScriptLoadManagerStorageKey);
    return data.gtmOnSuccess();
  }
}

/*==============================================================================
  Helpers
==============================================================================*/

/**
 * The asyncScriptLoadManagerStorageKey helper object is used to handle multiple asynchronous script injections.
 * It ensures that the tag execution status is reported only after all scripts have finished loading.
 */
function setAsyncScriptLoadManager(data) {
  const tagExecutionId = data.gtmTagId + '-' + data.gtmEventId + '-' + getTimestampMillis();
  const asyncScriptLoadManagerStorageKey = 'asyncScriptLoadManager-' + tagExecutionId;
  const asyncScriptLoadManager = {
    pendingInjectScriptCalls: 0,
    someFailed: false,
    maybeCallTagExecutionHandler: () => {
      const manager = templateStorage.getItem(asyncScriptLoadManagerStorageKey);
      manager.pendingInjectScriptCalls--;
      if (manager.pendingInjectScriptCalls === 0) {
        templateStorage.removeItem(asyncScriptLoadManagerStorageKey);
        return manager.someFailed ? data.gtmOnFailure() : data.gtmOnSuccess();
      }
      templateStorage.setItem(asyncScriptLoadManagerStorageKey, manager);
    }
  };
  templateStorage.setItem(asyncScriptLoadManagerStorageKey, asyncScriptLoadManager);
  return asyncScriptLoadManagerStorageKey;
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
