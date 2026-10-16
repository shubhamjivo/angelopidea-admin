import type { StrapiApp } from '@strapi/strapi/admin';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';

import logo from './extensions/logo.svg';
import icon from './extensions/icon.svg';

// Brand colours from the frontend (angelopedia/app/globals.css):
// accent red #be1e2d, light red #ff7582, ink #414042, greys #5c5c5e / #cccccc.
const brand = {
  primary100: '#fcedee',
  primary200: '#f2c5c9',
  primary500: '#d6414f',
  primary600: '#be1e2d',
  primary700: '#9a1824',
  buttonPrimary500: '#d6414f',
  buttonPrimary600: '#be1e2d',
  // "Published" badges and success toasts use the success colours.
  success100: '#fcedee',
  success200: '#f2c5c9',
  success500: '#d6414f',
  success600: '#be1e2d',
  success700: '#9a1824',
};

const light = {
  ...brand,
  neutral0: '#ffffff',
  neutral100: '#f7f7f7',
  neutral150: '#ededed',
  neutral200: '#dcdcdc',
  neutral300: '#cccccc',
  neutral400: '#a5a5a6',
  neutral500: '#8a8a8c',
  neutral600: '#5c5c5e',
  neutral700: '#4a494b',
  neutral800: '#414042',
  neutral900: '#2e2d2f',
  neutral1000: '#1d1c1e',
};

const dark = {
  ...brand,
  primary100: '#2a1416',
  primary200: '#6b2028',
  primary500: '#ff7582',
  primary700: '#ff8f99',
  success100: '#2a1416',
  success200: '#6b2028',
  success500: '#ff7582',
  success600: '#ff7582',
  success700: '#ff8f99',
  neutral0: '#232224',
  neutral100: '#1a191b',
  neutral150: '#333234',
  neutral200: '#48474a',
  neutral300: '#636265',
  neutral400: '#a5a5a6',
  neutral500: '#c2c2c3',
  neutral600: '#dcdcdd',
  neutral700: '#eaeaea',
  neutral800: '#f6f6f6',
  neutral900: '#ffffff',
  neutral1000: '#141315',
};

const FONT = "Poppins, Arial, Helvetica, sans-serif";

export default {
  config: {
    auth: { logo },
    menu: { logo: icon },
    head: { favicon: icon },
    theme: {
      light: { colors: light },
      dark: { colors: dark },
    },
    translations: {
      en: {
        'Auth.form.welcome.title': 'Welcome to Angelopedia',
        'Auth.form.welcome.subtitle': 'Log in to the Angelopedia CMS',
        'app.components.LeftMenu.navbrand.title': 'Angelopedia',
        'app.components.LeftMenu.navbrand.workplace': 'CMS',
      },
    },
    tutorials: false,
    notifications: { releases: false },
  },
  bootstrap(_app: StrapiApp) {
    // The design system sets its own font stack; use the frontend's Poppins instead.
    const style = document.createElement('style');
    style.textContent = `html body, html body button, html body input, html body textarea, html body select { font-family: ${FONT}; }`;
    document.head.appendChild(style);
  },
};
