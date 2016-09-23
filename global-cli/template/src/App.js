import React from 'react';
import Button from 'enact-moonstone/Button';
import {Panels, Header, Panel} from 'enact-moonstone/Panels';
import css from './App.less';

export default class App extends React.Component {
	render () {
		return (
			<div className={css.app}>
				<Panels>
					<Panel>
						<Header title="Hello world!" />
						<Button>Click me</Button>
					</Panel>
				</Panels>
			</div>
		);
	}
}
