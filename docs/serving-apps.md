---
title: Serving Apps
order: 6
---
## Development Server
```
  Usage
    enact serve [options]

  Options
    -b, --browser     Automatically open browser
    -i, --host        Server host IP address
    -p, --port        Server port number
```
The `enact serve` command (aliased as `npm run serve`) will build and host your project on **http://localhost:8080/**. The options allow you to customize the host IP and host port, which can also be overriden via `HOST` and `PORT` environment variable. While the `enact serve` is active, any changes to source code will trigger a rebuild and update any loaded browser windows.

## Custom Proxy

Enact CLI uses [http-proxy-middleware](https://github.com/chimurai/http-proxy-middleware) to allow applications to redirect HTTP requests to the proxy URL. When a resource is requested such as `fetch('/api/data')`, the development server will recognize that path does not represent a static asset and will redirect to the proxy path (e.g. `http://localhost:4000/api/data`).

This feature can be configured in the project's **package.json** within the `enact` object's `proxy` property.

For example:
```js
{
	...
	"enact": {
		...
		"proxy": "http://localhost:4000"
		...
	}
	...
} 
```

> **NOTE** The `serve` command opens a port for connections from outside the current machine. Firewall software may block or be used to block access to this port.
