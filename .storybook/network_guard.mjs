// D-12 layer 3: zero-dependency egress guard, preloaded with
// NODE_OPTIONS=--import=./.storybook/network_guard.mjs. Any TCP connection to
// a host that is not loopback or private is logged to $TRACE_LOG and destroyed.
import fs from "node:fs";
import net from "node:net";

// Only `localhost` and literal IP addresses are ever allowed. A hostname that merely starts
// with digits (`10.evil.example.com`, `127.0.0.1.attacker.net`) is a DNS name that resolves
// wherever its owner points it, so it is treated as public and blocked (Phase 70 review WR-01).
// The allowlist is deliberately closed: anything it does not recognise is blocked.
function isLoopbackOrPrivate(host) {
	if (/^localhost$/i.test(host)) {
		return true;
	}
	const family = net.isIP(host);
	if (family === 6) {
		return host === "::1";
	}
	if (family !== 4) {
		return false;
	}
	const [first, second] = host.split(".").map(Number);
	return (
		host === "0.0.0.0" ||
		first === 127 ||
		first === 10 ||
		(first === 192 && second === 168) ||
		(first === 172 && second >= 16 && second <= 31)
	);
}

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
	if (socketPath === undefined && !isLoopbackOrPrivate(String(host))) {
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
