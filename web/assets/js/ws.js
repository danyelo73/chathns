export class ws {
	constructor(parent) {
		this.parent = parent;

		this.pingTimer;
		this.typing;
	}

	async connect() {
		let connected = new Promise(resolve => {
			const local = ["localhost", "127.0.0.1", "100.87.180.103"].includes(window.location.hostname);
			this.socket = new WebSocket(local ? `ws://${window.location.hostname}:4444` : `wss://${window.location.host}/wss`);

			this.socket.onopen = (e) => {
				this.logMessage("CONNECTED");
				this.identify();

				this.pingTimer = setInterval(() => {
					this.sendPing();
				}, 30000);

				this.typing = setInterval(() => {
					this.parent.sendTyping();
					this.parent.updateTypingStatus();
					this.parent.ui.updateTypingView();
				}, 250);

				resolve();
			}

			this.socket.onclose = (e) => {
				this.logMessage("DISCONNECTED");
				clearInterval(this.pingTimer);

				this.parent.endAllVideo();
				this.parent.ready(false);
				setTimeout(() => {
					this.connect();
				}, 2000);
			}

			this.socket.onmessage = (e) => {
				this.logMessage(`IN: ${e.data}`);
				this.parent.message(e.data);
			}
		});

		return await connected;
	}

	sendPing() {
		this.send(`PING`);
	}

	send(message) {
		this.logMessage(`OUT: ${message}`);
		this.socket.send(message);
	} 

	identify() {
		this.send(`IDENTIFY ${this.parent.session}`);
	}

	logMessage(message) {
		if (this.parent.settings.debug) {
			console.log(message);
		}
	}
}