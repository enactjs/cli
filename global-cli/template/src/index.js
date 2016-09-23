import React from 'react';
import {render} from 'react-dom';
import App from './App';
import MoonstoneDecorator from 'enact-moonstone/MoonstoneDecorator';

const MoonstoneApp = MoonstoneDecorator(App);

render(
	<MoonstoneApp />,
	document.getElementById('root')
);
