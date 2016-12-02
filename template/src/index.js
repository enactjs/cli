import React from 'react';
import {render} from 'react-dom';
import App from './App';

let isRendered, appElement = (<App />);

if (typeof window !== 'undefined') {
	render(
		appElement,
		document.getElementById('root')
	);
	isRendered = true;
}

export default appElement;
export {isRendered};