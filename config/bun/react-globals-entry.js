import React from 'react';
import * as ReactDOMClient from 'react-dom/client';

if (typeof globalThis !== 'undefined') {
	globalThis.React = React;
	globalThis.ReactDOMClient = ReactDOMClient;
}

export default React;
