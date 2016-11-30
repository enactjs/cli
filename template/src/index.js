import React from 'react';
import {render} from 'react-dom';
import App from './App';

let appElement = (<App />);

if (typeof window !== 'undefined') {
	render(
		appElement,
		document.getElementById('root')
	);
}

export default appElement;
