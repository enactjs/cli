---
title: Serving Apps
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
Additional custom HTTP proxy options can declared in the project's **package.json** within the `enact` object's `proxy` property. 

For example:
```js
{
	...
	"enact": {
		...
		"proxy": { ... }
		...
	...
} 
```
See [http-proxy-middleware](https://github.com/chimurai/http-proxy-middleware) for details on available configurations.

> **NOTE** The `serve` command opens a port for connections from outside the current machine. Firewall software may block or be used to block access to this port.
