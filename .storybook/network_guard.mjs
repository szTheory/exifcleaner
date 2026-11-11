// D-12 layer 3: zero-dependency egress guard, preloaded with
// NODE_OPTIONS=--import=./.storybook/network_guard.mjs. Any TCP connection to
// a host that is not loopback or private is logged to $TRACE_LOG and destroyed.
import fs from "node:fs";
import net from "node:net";

const ALLOWED = [
	/^localhost$/i,
	/^127\./,
	/^::1$/,
	/^0\.0\.0\.0$/,
	/^10\./,
	/^192\.168\./,
	/^172\.(1[6-9]|2\d|3[01])\./,
];

const original = net.Socket.prototype.connect;

net.Socket.prototype.connect = function (...args) {
	const first = args[0];
	const options = Array.isArray(first) ? first[0] : first;
	const isObject = typeof options === "object" && options !== null;
	const host = isObject
		? (options.host ?? "localhost")
		: typeof args[1] === "string"
			? args[1]
			: "localhost";
	const socketPath = isObject ? options.path : undefined;
	if (
		socketPath === undefined &&
		!ALLOWED.some((re) => re.test(String(host)))
	) {
		if (process.env.TRACE_LOG) {
			fs.appendFileSync(process.env.TRACE_LOG, `BLOCKED ${host}\n`);
		}
		const error = new Error(
			`network_guard: outbound connection to ${host} blocked`,
		);
		process.nextTick(() => this.destroy(error));
		return this;
	}
	return original.apply(this, args);
};
