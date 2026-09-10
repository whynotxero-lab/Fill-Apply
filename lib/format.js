/**
 * Value formatting for a specific control.
 *
 * Knowing *which* field we found is only half the job — the value still has to
 * be in the shape that field accepts, and application forms disagree wildly:
 *
 *   - Greenhouse/Lever take a single phone field and are happy with +971501234567.
 *   - Indeed, LinkedIn and iCIMS render a country-code selector next to the
 *     number, so the same value must arrive as 501234567 with the code stripped.
 *   - Workday and many US career sites enforce pattern="\d{10}" or maxlength=10
 *     and silently reject anything with a "+" or a space.
 *   - US ZIP inputs are maxlength=5 numeric; Canadian and UK postcodes need a
 *     space in the right place and uppercase letters.
 *   - type="url" rejects "linkedin.com/in/name" without a scheme, while fields
 *     asking for a "username" reject the full URL.
 *
 * So every value is shaped against the constraints the control actually
 * advertises (type, pattern, maxlength, inputmode, step, placeholder mask) and,
 * for phone numbers, against whether the form has a separate country-code field.
 *
 * Attaches globalThis.FillApplyFormat.
 */
(function (global) {
  'use strict';

  /**
   * Longest-match dial codes, needed to split "+971501234567" into a country
   * code and a national number when the form wants them apart.
   */
  var DIAL_CODES = [
    '1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41',
    '43', '44', '45', '46', '47', '48', '49', '51', '52', '54', '55', '56', '57',
    '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90',
    '91', '92', '93', '94', '95', '98', '212', '213', '216', '218', '220', '233',
    '234', '249', '251', '254', '255', '256', '260', '263', '264', '265', '267',
    '351', '352', '353', '354', '355', '356', '357', '358', '359', '370', '371',
    '372', '373', '374', '375', '376', '377', '380', '381', '385', '386', '387',
    '389', '420', '421', '423', '501', '502', '503', '504', '505', '506', '507',
    '509', '590', '591', '593', '594', '595', '598', '852', '853', '855', '856',
    '880', '886', '960', '961', '962', '963', '964', '965', '966', '967', '968',
    '970', '971', '972', '973', '974', '975', '976', '977', '992', '993', '994',
    '995', '996', '998'
  ];

  /** Country aliases so a select offering "AE" still matches "United Arab Emirates". */
  var COUNTRIES = [
    { name: 'United Arab Emirates', iso2: 'AE', iso3: 'ARE', dial: '971', aka: ['uae', 'u.a.e.', 'emirates'] },
    { name: 'Saudi Arabia', iso2: 'SA', iso3: 'SAU', dial: '966', aka: ['ksa', 'kingdom of saudi arabia'] },
    { name: 'Qatar', iso2: 'QA', iso3: 'QAT', dial: '974', aka: [] },
    { name: 'Kuwait', iso2: 'KW', iso3: 'KWT', dial: '965', aka: [] },
    { name: 'Bahrain', iso2: 'BH', iso3: 'BHR', dial: '973', aka: [] },
    { name: 'Oman', iso2: 'OM', iso3: 'OMN', dial: '968', aka: [] },
    { name: 'Egypt', iso2: 'EG', iso3: 'EGY', dial: '20', aka: [] },
    { name: 'Jordan', iso2: 'JO', iso3: 'JOR', dial: '962', aka: [] },
    { name: 'Lebanon', iso2: 'LB', iso3: 'LBN', dial: '961', aka: [] },
    { name: 'Pakistan', iso2: 'PK', iso3: 'PAK', dial: '92', aka: [] },
    { name: 'India', iso2: 'IN', iso3: 'IND', dial: '91', aka: [] },
    { name: 'Bangladesh', iso2: 'BD', iso3: 'BGD', dial: '880', aka: [] },
    { name: 'Sri Lanka', iso2: 'LK', iso3: 'LKA', dial: '94', aka: [] },
    { name: 'Philippines', iso2: 'PH', iso3: 'PHL', dial: '63', aka: [] },
    { name: 'United States', iso2: 'US', iso3: 'USA', dial: '1', aka: ['usa', 'u.s.', 'u.s.a.', 'united states of america', 'america'] },
    { name: 'Canada', iso2: 'CA', iso3: 'CAN', dial: '1', aka: [] },
    { name: 'United Kingdom', iso2: 'GB', iso3: 'GBR', dial: '44', aka: ['uk', 'u.k.', 'great britain', 'england', 'britain'] },
    { name: 'Ireland', iso2: 'IE', iso3: 'IRL', dial: '353', aka: [] },
    { name: 'Germany', iso2: 'DE', iso3: 'DEU', dial: '49', aka: ['deutschland'] },
    { name: 'France', iso2: 'FR', iso3: 'FRA', dial: '33', aka: [] },
    { name: 'Netherlands', iso2: 'NL', iso3: 'NLD', dial: '31', aka: ['holland', 'the netherlands'] },
    { name: 'Spain', iso2: 'ES', iso3: 'ESP', dial: '34', aka: [] },
    { name: 'Portugal', iso2: 'PT', iso3: 'PRT', dial: '351', aka: [] },
    { name: 'Italy', iso2: 'IT', iso3: 'ITA', dial: '39', aka: [] },
    { name: 'Poland', iso2: 'PL', iso3: 'POL', dial: '48', aka: [] },
    { name: 'Sweden', iso2: 'SE', iso3: 'SWE', dial: '46', aka: [] },
    { name: 'Switzerland', iso2: 'CH', iso3: 'CHE', dial: '41', aka: [] },
    { name: 'Australia', iso2: 'AU', iso3: 'AUS', dial: '61', aka: [] },
    { name: 'New Zealand', iso2: 'NZ', iso3: 'NZL', dial: '64', aka: [] },
    { name: 'Singapore', iso2: 'SG', iso3: 'SGP', dial: '65', aka: [] },
    { name: 'Hong Kong', iso2: 'HK', iso3: 'HKG', dial: '852', aka: [] },
    { name: 'Malaysia', iso2: 'MY', iso3: 'MYS', dial: '60', aka: [] },
    { name: 'Indonesia', iso2: 'ID', iso3: 'IDN', dial: '62', aka: [] },
    { name: 'Japan', iso2: 'JP', iso3: 'JPN', dial: '81', aka: [] },
    { name: 'China', iso2: 'CN', iso3: 'CHN', dial: '86', aka: [] },
    { name: 'South Africa', iso2: 'ZA', iso3: 'ZAF', dial: '27', aka: [] },
    { name: 'Nigeria', iso2: 'NG', iso3: 'NGA', dial: '234', aka: [] },
    { name: 'Kenya', iso2: 'KE', iso3: 'KEN', dial: '254', aka: [] },
    { name: 'Turkey', iso2: 'TR', iso3: 'TUR', dial: '90', aka: ['turkiye', 'türkiye'] },
    { name: 'Brazil', iso2: 'BR', iso3: 'BRA', dial: '55', aka: [] },
    { name: 'Mexico', iso2: 'MX', iso3: 'MEX', dial: '52', aka: [] }
  ];

  var US_STATES = [
    ['Alabama', 'AL'], ['Alaska', 'AK'], ['Arizona', 'AZ'], ['Arkansas', 'AR'],
    ['California', 'CA'], ['Colorado', 'CO'], ['Connecticut', 'CT'], ['Delaware', 'DE'],
    ['District of Columbia', 'DC'], ['Florida', 'FL'], ['Georgia', 'GA'], ['Hawaii', 'HI'],
    ['Idaho', 'ID'], ['Illinois', 'IL'], ['Indiana', 'IN'], ['Iowa', 'IA'],
    ['Kansas', 'KS'], ['Kentucky', 'KY'], ['Louisiana', 'LA'], ['Maine', 'ME'],
    ['Maryland', 'MD'], ['Massachusetts', 'MA'], ['Michigan', 'MI'], ['Minnesota', 'MN'],
    ['Mississippi', 'MS'], ['Missouri', 'MO'], ['Montana', 'MT'], ['Nebraska', 'NE'],
    ['Nevada', 'NV'], ['New Hampshire', 'NH'], ['New Jersey', 'NJ'], ['New Mexico', 'NM'],
    ['New York', 'NY'], ['North Carolina', 'NC'], ['North Dakota', 'ND'], ['Ohio', 'OH'],
    ['Oklahoma', 'OK'], ['Oregon', 'OR'], ['Pennsylvania', 'PA'], ['Rhode Island', 'RI'],
    ['South Carolina', 'SC'], ['South Dakota', 'SD'], ['Tennessee', 'TN'], ['Texas', 'TX'],
    ['Utah', 'UT'], ['Vermont', 'VT'], ['Virginia', 'VA'], ['Washington', 'WA'],
    ['West Virginia', 'WV'], ['Wisconsin', 'WI'], ['Wyoming', 'WY']
  ];

  var CURRENCY_RE =
    /\b(AED|SAR|USD|EUR|GBP|PKR|INR|CAD|AUD|CHF|JPY|CNY|QAR|KWD|BHD|OMR|EGP|ZAR|SGD|HKD|MYR|TRY|BRL|MXN)\b/gi;

  function str(value) {
    return value == null ? '' : String(value);
  }

  function trim(value) {
    return str(value).replace(/\s+/g, ' ').trim();
  }

  function lower(value) {
    return trim(value).toLowerCase();
  }

  function digitsOf(value) {
    return str(value).replace(/\D+/g, '');
  }

  function isBlank(value) {
    return value == null || String(value).trim() === '';
  }

  /** Numeric attribute or null — jsdom and Chrome both report maxLength as -1 when unset. */
  function positiveNumber(value) {
    var n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /**
   * Numeric attribute or null. An absent min/max reads back as "", and Number("")
   * is 0, which would clamp every salary to zero.
   */
  function numberAttr(value) {
    if (value == null || String(value).trim() === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function attr(el, name) {
    if (!el || !el.getAttribute) return '';
    return el.getAttribute(name) || '';
  }

  /**
   * Normalize an element or an existing descriptor into the constraint bag the
   * formatters read, so callers can pass either.
   */
  function constraintsOf(target) {
    if (!target) return {};
    var isElement = !!(target.tagName || target.nodeType === 1);
    if (!isElement) {
      return {
        type: lower(target.type),
        name: str(target.name),
        id: str(target.id),
        autocomplete: lower(target.autocomplete),
        placeholder: str(target.placeholder),
        label: str(target.label),
        pattern: str(target.pattern),
        inputMode: lower(target.inputMode || target.inputmode),
        maxLength: positiveNumber(target.maxLength),
        min: target.min,
        max: target.max,
        step: target.step,
        title: str(target.title),
        tag: str(target.tag || target.tagName)
      };
    }
    return {
      type: lower(target.type),
      name: attr(target, 'name'),
      id: str(target.id),
      autocomplete: lower(attr(target, 'autocomplete')),
      placeholder: attr(target, 'placeholder'),
      label: '',
      pattern: attr(target, 'pattern'),
      inputMode: lower(attr(target, 'inputmode')),
      maxLength: positiveNumber(target.maxLength),
      min: attr(target, 'min'),
      max: attr(target, 'max'),
      step: attr(target, 'step'),
      title: attr(target, 'title'),
      tag: str(target.tagName)
    };
  }

  function blobOf(c) {
    return lower([c.autocomplete, c.name, c.id, c.label, c.placeholder, c.title].join(' '));
  }

  /**
   * What kind of value this control wants. `key` is the profile key the answer
   * came from and is trusted first, since the field map already did the
   * label/name/autocomplete matching.
   */
  function fieldKind(target, key) {
    var c = constraintsOf(target);
    var blob = blobOf(c);
    var type = c.type;

    if (key === 'phoneCountry') return 'phoneCountry';
    if (c.autocomplete === 'tel-country-code') return 'phoneCountry';
    if (/\b(country code|dial code|calling code|phone country|area code)\b/.test(blob)) {
      return 'phoneCountry';
    }

    if (key === 'phone' || type === 'tel' || c.autocomplete === 'tel') return 'phone';
    if (/\b(phone|mobile|telephone|cell|whatsapp)\b/.test(blob)) return 'phone';

    if (key === 'zip' || key === 'postcode') return 'postal';
    if (c.autocomplete === 'postal-code') return 'postal';
    if (/\b(zip|postal|postcode|post code|pin code)\b/.test(blob)) return 'postal';

    if (key === 'email' || type === 'email') return 'email';

    if (type === 'url') return 'url';
    if (['linkedin', 'portfolio', 'website', 'github', 'resumeUrl', 'coverUrl'].indexOf(key) !== -1) {
      return 'url';
    }

    if (type === 'date' || type === 'month' || type === 'week') return 'date';
    if (/\b(date of birth|birth date|\bdob\b|start date|available from|graduation date)\b/.test(blob)) {
      return 'date';
    }

    if (key === 'country' || key === 'nationality') return 'country';
    if (key === 'state') return 'state';
    if (['fullName', 'firstName', 'lastName'].indexOf(key) !== -1) return 'name';

    if (type === 'number' || type === 'range') return 'number';
    if (c.inputMode === 'numeric' || c.inputMode === 'decimal') return 'number';
    if (type === 'tel' && /\d/.test(c.pattern)) return 'number';

    return 'text';
  }

  /** Anchored test, because pattern="\d{10}" means the whole value. */
  function matchesPattern(value, pattern) {
    if (!pattern) return true;
    try {
      return new RegExp('^(?:' + pattern + ')$').test(str(value));
    } catch (_e) {
      return true;
    }
  }

  function fitsLength(value, maxLength) {
    return !maxLength || str(value).length <= maxLength;
  }

  /**
   * Digit slots in a placeholder mask: "(555) 555-5555", "___-___-____",
   * "xxx-xxx-xxxx", "+1 999 999 9999". Anything else is a literal.
   */
  function maskSlots(mask) {
    var m = str(mask);
    var count = 0;
    for (var i = 0; i < m.length; i++) {
      if (/[0-9_xX#]/.test(m[i])) count += 1;
    }
    return count;
  }

  function looksLikeMask(mask) {
    var m = str(mask);
    if (!m) return false;
    if (maskSlots(m) < 6) return false;
    // A real example number is a mask too, but prose like "Enter your phone" is not.
    return !/[a-wyzA-WYZ]{3,}/.test(m.replace(/[xX]/g, ''));
  }

  function applyMask(digits, mask) {
    var d = digitsOf(digits);
    var out = '';
    var di = 0;
    for (var i = 0; i < mask.length; i++) {
      var ch = mask[i];
      if (/[0-9_xX#]/.test(ch)) {
        if (di >= d.length) return '';
        out += d[di++];
      } else {
        out += ch;
      }
    }
    return di === d.length ? out : '';
  }

  function findCountry(value) {
    var v = lower(value).replace(/[.]/g, '');
    if (!v) return null;
    for (var i = 0; i < COUNTRIES.length; i++) {
      var c = COUNTRIES[i];
      if (lower(c.name) === v || lower(c.iso2) === v || lower(c.iso3) === v) return c;
      for (var a = 0; a < c.aka.length; a++) {
        if (lower(c.aka[a]).replace(/[.]/g, '') === v) return c;
      }
    }
    return null;
  }

  function countryByDial(dial) {
    var d = digitsOf(dial);
    if (!d) return null;
    for (var i = 0; i < COUNTRIES.length; i++) {
      if (COUNTRIES[i].dial === d) return COUNTRIES[i];
    }
    return null;
  }

  /** Longest dial code that prefixes these digits. */
  function splitDial(digits) {
    var d = digitsOf(digits);
    var best = '';
    for (var i = 0; i < DIAL_CODES.length; i++) {
      var code = DIAL_CODES[i];
      if (d.indexOf(code) === 0 && code.length > best.length) best = code;
    }
    return best ? { dial: best, national: d.slice(best.length) } : { dial: '', national: d };
  }

  /**
   * Split a profile into the phone pieces every layout needs: the dial code on
   * its own, the national number without a trunk zero, and full E.164.
   */
  function phoneParts(profile) {
    profile = profile || {};
    var rawPhone = trim(profile.phone);
    var rawCountry = trim(profile.phoneCountry);
    var dial = digitsOf(rawCountry);
    // "UAE (+971)" and "+971" both appear in stored profiles.
    if (!dial && rawCountry) dial = digitsOf((rawCountry.match(/\+?\d[\d\s-]*/) || [''])[0]);

    var national = digitsOf(rawPhone);
    var explicitPlus = /^\s*\+/.test(rawPhone);

    if (explicitPlus) {
      var split = splitDial(national);
      if (split.dial) {
        if (!dial) dial = split.dial;
        national = split.national;
      }
    } else if (dial && national.indexOf(dial) === 0 && national.length > dial.length + 5) {
      // Stored as "971501234567" alongside phoneCountry "+971".
      national = national.slice(dial.length);
    }

    // Trunk prefix is national-only notation; it must not survive next to a code.
    if (dial && national.length > 1 && national[0] === '0') national = national.replace(/^0+/, '');

    return {
      dial: dial ? '+' + dial : '',
      dialDigits: dial,
      national: national,
      trunk: national ? '0' + national : '',
      // Without a known country code there is no E.164 form to offer; inventing
      // a "+" in front of a national number produces an invalid number.
      e164: dial && national ? '+' + dial + national : '',
      digits: dial && national ? dial + national : national,
      country: countryByDial(dial)
    };
  }

  /** Exact digit count when a pattern is nothing but N digits, e.g. "\d{10}". */
  function patternDigitCount(pattern) {
    var p = str(pattern).trim();
    if (!p) return null;
    var m = p.match(/^(?:\\d|\[0-9\])\{(\d+)\}$/);
    return m ? Number(m[1]) : null;
  }

  /**
   * Pick the phone shape this control accepts.
   *
   * `hasCountryField` matters most: when the form renders its own country-code
   * selector, sending E.164 into the number box produces "+971+971501234567".
   */
  function formatPhone(target, parts, opts) {
    opts = opts || {};
    var c = constraintsOf(target);
    var hasCountryField = !!opts.hasCountryField;
    if (!parts || (!parts.national && !parts.digits)) return { value: '', skip: true };

    var national = parts.national || parts.digits;
    var candidates = [];

    function push(value, format) {
      if (value) candidates.push({ value: value, format: format });
    }

    // Strongest signal first: a pattern that spells out an exact digit count.
    var wantDigits = patternDigitCount(c.pattern);
    if (wantDigits) {
      var pool = digitsOf(parts.digits);
      if (digitsOf(national).length === wantDigits) push(national, 'pattern_national');
      else if (pool.length >= wantDigits) push(pool.slice(-wantDigits), 'pattern_digits');
    }

    // Then a placeholder that is really an input mask, e.g. "(555) 555-5555".
    if (looksLikeMask(c.placeholder)) {
      var slots = maskSlots(c.placeholder);
      var withCode = digitsOf(parts.digits);
      if (slots === withCode.length) push(applyMask(withCode, c.placeholder), 'mask');
      else if (slots === national.length) push(applyMask(national, c.placeholder), 'mask');
    }

    // Then maxlength, the bluntest signal there is: 10 means "10 digits, no plus".
    if (c.maxLength) {
      if (national.length <= c.maxLength) push(national, 'national_maxlength');
      var trimmed = digitsOf(parts.digits);
      push(trimmed.length > c.maxLength ? trimmed.slice(-c.maxLength) : trimmed, 'digits_maxlength');
    }

    if (hasCountryField) {
      push(national, 'national');
      push(parts.trunk, 'national_trunk');
      push(parts.e164, 'e164');
    } else {
      push(parts.e164, 'e164');
      push(parts.digits, 'digits_with_code');
      push(national, 'national');
      push(parts.trunk, 'national_trunk');
    }

    for (var i = 0; i < candidates.length; i++) {
      var cand = candidates[i];
      if (matchesPattern(cand.value, c.pattern) && fitsLength(cand.value, c.maxLength)) {
        return { value: cand.value, skip: false, format: cand.format };
      }
    }

    // Nothing satisfied the constraints — digits are the safest remaining guess.
    var fallback = digitsOf(parts.digits || national);
    if (c.maxLength && fallback.length > c.maxLength) fallback = fallback.slice(-c.maxLength);
    return { value: fallback, skip: !fallback, format: 'digits' };
  }

  /** Country code on its own: "+971", "971", or the country name for a select. */
  function formatPhoneCountry(target, parts) {
    var c = constraintsOf(target);
    if (!parts || !parts.dialDigits) return { value: '', skip: true };

    if (c.tag === 'SELECT' || c.type === 'select' || c.type === 'select-one') {
      return { value: parts.dial, skip: false, format: 'dial_plus' };
    }
    var withPlus = parts.dial;
    var bare = parts.dialDigits;
    var ordered = [withPlus, bare];
    if (c.type === 'number' || c.inputMode === 'numeric' || /^\\d/.test(c.pattern)) {
      ordered = [bare, withPlus];
    }
    for (var i = 0; i < ordered.length; i++) {
      if (matchesPattern(ordered[i], c.pattern) && fitsLength(ordered[i], c.maxLength)) {
        return { value: ordered[i], skip: false, format: i === 0 ? 'preferred' : 'alternate' };
      }
    }
    return { value: bare, skip: !bare, format: 'digits' };
  }

  /**
   * Postal codes: US wants 5 digits, Canada "A1A 1A1", UK "SW1A 1AA", and
   * plenty of forms accept only what their pattern says.
   */
  function formatPostal(target, value, opts) {
    opts = opts || {};
    var c = constraintsOf(target);
    var raw = trim(value).toUpperCase();
    if (!raw) return { value: '', skip: true };

    var country = findCountry(opts.country);
    var iso = country ? country.iso2 : '';
    var candidates = [];

    function push(v, format) {
      if (v) candidates.push({ value: v, format: format });
    }

    var compact = raw.replace(/[\s-]+/g, '');
    var digits = digitsOf(raw);

    if (iso === 'CA' || /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact)) {
      push(compact.replace(/^(.{3})(.{3})$/, '$1 $2'), 'canada');
      push(compact, 'compact');
    } else if (iso === 'GB' || /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact)) {
      push(compact.replace(/^(.+)(\d[A-Z]{2})$/, '$1 $2'), 'uk');
      push(compact, 'compact');
    } else if (iso === 'US') {
      push(digits.slice(0, 5), 'us5');
      if (digits.length >= 9) push(digits.slice(0, 5) + '-' + digits.slice(5, 9), 'us9');
    }

    var numericOnly =
      c.type === 'number' ||
      c.inputMode === 'numeric' ||
      /^\\d|\[0-9\]/.test(c.pattern) ||
      (c.maxLength === 5 && digits.length >= 5);
    if (numericOnly && digits) push(c.maxLength ? digits.slice(0, c.maxLength) : digits, 'digits');

    push(raw, 'as_is');
    push(compact, 'compact');
    if (digits) push(digits, 'digits');

    for (var i = 0; i < candidates.length; i++) {
      var cand = candidates[i];
      if (matchesPattern(cand.value, c.pattern) && fitsLength(cand.value, c.maxLength)) {
        return { value: cand.value, skip: false, format: cand.format };
      }
    }
    var fallback = c.maxLength ? raw.slice(0, c.maxLength) : raw;
    return { value: fallback, skip: !fallback, format: 'truncated' };
  }

  /** Ask for a username and a full URL is rejected; ask for a URL and a bare domain is. */
  function formatUrl(target, value) {
    var c = constraintsOf(target);
    var raw = trim(value).replace(/\s+/g, '');
    if (!raw) return { value: '', skip: true };

    var withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw.replace(/^\/+/, '');
    var blob = blobOf(c);
    var wantsHandle =
      /\b(username|user name|handle|profile id|screen name)\b/.test(blob) ||
      (!!c.pattern && !matchesPattern(withScheme, c.pattern) && !/[:\/]/.test(c.pattern));

    if (wantsHandle) {
      var handle = withScheme
        .replace(/^[a-z]+:\/\//i, '')
        .replace(/^www\./i, '')
        .replace(/\/+$/, '');
      var seg = handle.split('/').filter(Boolean).pop() || handle;
      if (matchesPattern(seg, c.pattern) && fitsLength(seg, c.maxLength)) {
        return { value: seg, skip: false, format: 'handle' };
      }
    }

    var ordered = [withScheme, raw.replace(/^[a-z]+:\/\//i, '')];
    for (var i = 0; i < ordered.length; i++) {
      if (matchesPattern(ordered[i], c.pattern) && fitsLength(ordered[i], c.maxLength)) {
        return { value: ordered[i], skip: false, format: i === 0 ? 'absolute' : 'bare' };
      }
    }
    return { value: withScheme, skip: false, format: 'absolute' };
  }

  function formatEmail(target, value) {
    var c = constraintsOf(target);
    var raw = str(value).replace(/\s+/g, '').trim();
    if (!raw) return { value: '', skip: true };
    if (!fitsLength(raw, c.maxLength)) return { value: raw, skip: false, format: 'over_length' };
    return { value: raw, skip: false, format: 'email' };
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function parseDateParts(value) {
    var s = trim(value);
    if (!s) return null;
    var iso = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
    if (iso) {
      return { y: Number(iso[1]), m: Number(iso[2]), d: iso[3] ? Number(iso[3]) : 1 };
    }
    // Ambiguous dd/mm vs mm/dd: treat >12 as the day, else assume the US order
    // the majority of ATS placeholders use.
    var slash = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (slash) {
      var a = Number(slash[1]);
      var b = Number(slash[2]);
      var y = Number(slash[3]);
      if (y < 100) y += y < 50 ? 2000 : 1900;
      return a > 12 ? { y: y, m: b, d: a } : { y: y, m: a, d: b };
    }
    var parsed = Date.parse(s);
    if (Number.isNaN(parsed)) return null;
    var dt = new Date(parsed);
    return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
  }

  /** Order the control expects, read off its placeholder when it has one. */
  function dateOrderFrom(placeholder) {
    var p = lower(placeholder);
    if (!p) return null;
    if (/y{4}.*m{1,2}.*d{1,2}/.test(p)) return 'ymd';
    if (/d{1,2}.*m{1,2}.*y{2,4}/.test(p)) return 'dmy';
    if (/m{1,2}.*d{1,2}.*y{2,4}/.test(p)) return 'mdy';
    if (/m{1,2}.*y{2,4}/.test(p)) return 'my';
    return null;
  }

  function formatDate(target, value) {
    var c = constraintsOf(target);
    var parts = parseDateParts(value);
    if (!parts) return { value: '', skip: true };

    if (c.type === 'date') {
      return {
        value: parts.y + '-' + pad2(parts.m) + '-' + pad2(parts.d),
        skip: false,
        format: 'iso'
      };
    }
    if (c.type === 'month') {
      return { value: parts.y + '-' + pad2(parts.m), skip: false, format: 'iso_month' };
    }

    var sep = (str(c.placeholder).match(/[\/.-]/) || ['/'])[0];
    var order = dateOrderFrom(c.placeholder) || 'mdy';
    var built;
    if (order === 'ymd') built = [parts.y, pad2(parts.m), pad2(parts.d)].join(sep);
    else if (order === 'dmy') built = [pad2(parts.d), pad2(parts.m), parts.y].join(sep);
    else if (order === 'my') built = [pad2(parts.m), parts.y].join(sep);
    else built = [pad2(parts.m), pad2(parts.d), parts.y].join(sep);

    var isoFallback = parts.y + '-' + pad2(parts.m) + '-' + pad2(parts.d);
    var ordered = [built, isoFallback];
    for (var i = 0; i < ordered.length; i++) {
      if (matchesPattern(ordered[i], c.pattern) && fitsLength(ordered[i], c.maxLength)) {
        return { value: ordered[i], skip: false, format: i === 0 ? order : 'iso' };
      }
    }
    return { value: built, skip: false, format: order };
  }

  /** Digits for a numeric control: "25000 AED" → "25000", clamped to min/max. */
  function formatNumber(target, value) {
    var c = constraintsOf(target);
    var cleaned = str(value)
      .replace(CURRENCY_RE, '')
      .replace(/[£$€¥₹﷼]/g, '')
      .replace(/,/g, '')
      .replace(/\s+/g, '');
    var match = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (!match) return { value: '', skip: true };
    var num = Number(match[0]);
    if (!Number.isFinite(num)) return { value: '', skip: true };

    var stepIsInteger = c.step === '' || c.step == null || /^\d+$/.test(String(c.step));
    if (stepIsInteger && c.type === 'number') num = Math.round(num);

    var min = numberAttr(c.min);
    var max = numberAttr(c.max);
    if (min != null && num < min) num = min;
    if (max != null && num > max) num = max;

    var out = String(num);
    if (c.maxLength && out.length > c.maxLength) {
      return { value: out.slice(0, c.maxLength), skip: false, format: 'number_truncated' };
    }
    return { value: out, skip: false, format: 'number' };
  }

  function formatName(target, value) {
    var c = constraintsOf(target);
    var raw = trim(value).replace(/\s*,\s*$/, '');
    if (!raw) return { value: '', skip: true };
    if (c.maxLength && raw.length > c.maxLength) {
      return { value: raw.slice(0, c.maxLength), skip: false, format: 'truncated' };
    }
    return { value: raw, skip: false, format: 'name' };
  }

  /** Long answers into short boxes: cut on a word boundary, not mid-word. */
  function formatText(target, value) {
    var c = constraintsOf(target);
    var raw = str(value);
    if (!raw.trim()) return { value: '', skip: true };
    if (!c.maxLength || raw.length <= c.maxLength) {
      return { value: raw, skip: false, format: 'text' };
    }
    var cut = raw.slice(0, c.maxLength);
    var lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > c.maxLength * 0.6) cut = cut.slice(0, lastSpace);
    return { value: cut.replace(/[\s,;:]+$/, ''), skip: false, format: 'truncated' };
  }

  /**
   * Every spelling of a country or state a select might offer, best first, so
   * option matching can try "AE" when the profile says "United Arab Emirates".
   */
  function valueVariants(value, kind) {
    var out = [];
    var raw = trim(value);
    if (!raw) return out;
    out.push(raw);

    if (kind === 'state') {
      var vLower = lower(raw);
      for (var s = 0; s < US_STATES.length; s++) {
        if (lower(US_STATES[s][0]) === vLower) out.push(US_STATES[s][1]);
        else if (lower(US_STATES[s][1]) === vLower) out.push(US_STATES[s][0]);
      }
      return dedupe(out);
    }

    var country = findCountry(raw);
    if (country) {
      out.push(country.name, country.iso2, country.iso3);
      country.aka.forEach(function (a) {
        out.push(a.toUpperCase());
      });
    }
    return dedupe(out);
  }

  function dedupe(list) {
    var seen = {};
    return list.filter(function (item) {
      var k = lower(item);
      if (!k || seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  /**
   * Shape `value` for `target`.
   *
   * context: { key, profile, hasPhoneCountryField, country }
   * Returns { value, skip, kind, format }. `skip` means the control should be
   * left alone rather than filled with something it will reject.
   */
  function formatForField(target, value, context) {
    context = context || {};
    var profile = context.profile || {};
    var kind = context.kind || fieldKind(target, context.key);
    var result;

    if (isBlank(value)) {
      return { value: '', skip: true, kind: kind, format: 'blank' };
    }

    switch (kind) {
      case 'phone':
        // The resolved answer is the number; the profile only supplies the
        // country code when the answer does not already carry one.
        result = formatPhone(
          target,
          phoneParts({ phone: value, phoneCountry: profile.phoneCountry }),
          { hasCountryField: !!context.hasPhoneCountryField }
        );
        break;
      case 'phoneCountry':
        result = formatPhoneCountry(
          target,
          phoneParts({ phone: profile.phone, phoneCountry: value })
        );
        break;
      case 'postal':
        result = formatPostal(target, value, { country: context.country || profile.country });
        break;
      case 'email':
        result = formatEmail(target, value);
        break;
      case 'url':
        result = formatUrl(target, value);
        break;
      case 'date':
        result = formatDate(target, value);
        break;
      case 'number':
        result = formatNumber(target, value);
        break;
      case 'name':
        result = formatName(target, value);
        break;
      case 'country':
      case 'state':
        result = formatText(target, value);
        break;
      default:
        result = formatText(target, value);
    }

    result = result || { value: '', skip: true };
    result.kind = kind;
    return result;
  }

  global.FillApplyFormat = {
    COUNTRIES: COUNTRIES,
    US_STATES: US_STATES,
    constraintsOf: constraintsOf,
    fieldKind: fieldKind,
    matchesPattern: matchesPattern,
    maskSlots: maskSlots,
    applyMask: applyMask,
    findCountry: findCountry,
    splitDial: splitDial,
    phoneParts: phoneParts,
    formatPhone: formatPhone,
    formatPhoneCountry: formatPhoneCountry,
    formatPostal: formatPostal,
    formatUrl: formatUrl,
    formatEmail: formatEmail,
    formatDate: formatDate,
    formatNumber: formatNumber,
    formatName: formatName,
    formatText: formatText,
    valueVariants: valueVariants,
    formatForField: formatForField
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
