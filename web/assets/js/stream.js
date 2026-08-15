export class stream {
	constructor(parent) {
		this.parent = parent;

		this.janus;
		this.sfu;

		this.janus2;
		this.sfu2;

		this.dish = new Dish($("#videoContainer")[0]);
		this.dish.append();
		this.dish.resize();

		this.myid;
		this.pvtid;
		this.pvtid2;

		window.addEventListener("resize", () => {
			this.dish.resize();
		});

		Janus.init({debug: "none"});
	}

	async init(type=false) {
		let done = new Promise(resolve => {
			let instance = "main";
			let j = this;
			let janus = j.janus;
			if (type == "screen") {
				janus = j.janus2;
				instance = "screen";
			}

			if (janus) {
				resolve();
			}
			else {
			    if (type == "screen") {
					j.janus2 = new Janus({
				        server: j.parent.streamURL,
				        success: () => {
				        	j.janus2.attach({
					    		plugin: "janus.plugin.videoroom",
					    		success: (pluginHandle) => {
						        	this.handle(instance, "success", pluginHandle).then(() => {
						        		resolve();
						        	});
						        },
						        error: (error) => {
						        	this.handle(instance, "error", error).then(() => {
						        		resolve();
							        });
						        },
						        onmessage: (msg, jsep) => {
						        	if (["joined", "event"].includes(msg["videoroom"])) {
						        		if (msg["videoroom"] == "joined") {
						        			this.pvtid2 = msg["private_id"];
						        		}
							        	this.handle(instance, "message", msg, jsep);
							        }
							        if (jsep) {
							        	this.sfu2.handleRemoteJsep({ jsep: jsep });
							        }
						        },
						        onlocalstream: (stream) =>  {
											this.handle(instance, "local", stream);
									j.parent.ui.setMute("toggleScreen", 0);
								},
								oncleanup: () => {
											this.handle(instance, "cleanup", { display: j.parent.domain });
									j.parent.ui.setMute("toggleScreen", 1);
								}
					    	});
				        }
				    });
			    }
			    else {
			    	j.janus = new Janus({
				        server: j.parent.streamURL,
				        success: () => {
				        	j.janus.attach({
					    		plugin: "janus.plugin.videoroom",
					    		success: (pluginHandle) => {
						        	this.handle(instance, "success", pluginHandle).then(() => {
  						        		resolve();
						        	});
						        },
						        error: (error) => {
						        	this.handle(instance, "error", error).then(() => {
						        		resolve();
							        });
						        },
						        onmessage: (msg, jsep) => {
								        	if (["joined", "event", "talking", "stopped-talking"].includes(msg["videoroom"])) {
						        		if (msg["videoroom"] == "joined") {
						        			this.myid = msg["id"];
						        			this.pvtid = msg["private_id"];

						        			if (
						        				Object.keys(this.parent.currentVideoUsers()).includes(this.parent.domain) &&
						        				!this.sfu.webrtcStuff.myStream
						        			) {
						        				this.publish();
						        			}
						        		}
							        	this.handle(instance, "message", msg, jsep);
							        }

							        if (jsep) {
							        	this.sfu.handleRemoteJsep({ jsep: jsep });
							        }
						        },
						        iceState: (state) => {
								},
								webrtcState: (on, reason) => {
								},
								mediaState: (medium, on) => {
								},
								slowLink: (uplink, lost, mid) => {
								},
								onlocalstream: (stream) =>  {
									this.handle(instance, "local", stream);
								},
								oncleanup: () => {
									this.handle(instance, "cleanup", { display: j.parent.domain });
								}
					    	});
				        }
				    });
			    }
			}
		});
		return await done;
	}

	subscribe(publisher) {
		let j = this;
		let feed;
		j.janus.attach({
			plugin: "janus.plugin.videoroom",
			opaqueId: j.parent.domain,
			success: (pluginHandle) => {
				feed = pluginHandle;
				let message = {
					request: "join",
					room: j.parent.conversation,
					ptype: "subscriber",
					feed: publisher.id,
					private_id: j.pvtid
				};
				feed.send({ message: message });
			},
			onmessage: function(msg, jsep) {
				if (jsep) {
					Janus.debug("Handling SDP as well...", jsep);
					feed.createAnswer({
						jsep: jsep,
						media: { audioSend: false, videoSend: false },
						success: function(jsep) {
							Janus.debug("Got SDP!", jsep);
							let message = { request: "start", room: j.parent.conversation };
							feed.send({ message: message, jsep: jsep });
						},
						error: function(error) {
							Janus.error("WebRTC error:", error);
						}
					});
				}
			},
			onremotestream: (stream) => {
				publisher.stream = stream;
				j.handle("video", "remote", publisher);
			},
			oncleanup: () => {
				j.handle("video", "cleanup", publisher);
			}
		});
	}

	async handle(instance, type, data=false, jsep=false) {
		let done = new Promise(resolve => {
			switch (type) {
				case "success":
					if (instance == "screen") {
						this.sfu2 = data;
						this.register(this.sfu2);
					}
					else {
						this.sfu = data;
						if (Object.keys(this.parent.currentVideoUsers()).includes(this.parent.domain)) {
							this.register(this.sfu);
						}
						else {
							this.publishers(this.sfu);
						}
					}
					resolve();
					break;

				case "error":
					resolve();
					break;

				case "message":
					switch (data.videoroom) {
						case "talking":
							this.talking(data.id, true);
							break;

						case "stopped-talking":
							this.talking(data.id, false);
							break;

						default:
							$.each(data["publishers"], (k, p) => {
								if (Object.keys(this.parent.currentVideoUsers()).includes(p.display)) {
									this.subscribe(p);
								}
							});
							break;
					}
					resolve();
					break;

				case "local":
					if (instance == "screen") {
						this.attachScreen(this.parent.domain, data);
					}
					else {
						this.addCam(this.parent.domain, this.myid);
		           		this.attachVideo(this.parent.domain, data);
		           	}
	           		resolve();
					break;

				case "remote":
					if (data.audio_codec || "talking" in data) {
						this.addCam(data.display, data.id);
						this.attachVideo(data.display, data.stream);
					}
					else {
						this.attachScreen(data.display, data.stream);
					}
					resolve();
					break;

				case "cleanup":
					if ((data.audio_codec || !data.id) && instance !== "screen") {
						this.removeCam(data.display);
					}
					else {
						this.removeScreen();
					}
					resolve();
					break;
			}
		});
		return await done;
	}

	getRandomNumber(digit) {
		return Math.random().toFixed(digit).split('.')[1];
	}

	register(sfu) {
		let message = {
			request: "join",
			room: this.parent.conversation,
			ptype: "publisher",
			id: this.getRandomNumber(16),
			display: this.parent.domain
		};
		sfu.send({ message: message });
	}

	publishers(sfu) {
		let message = {
			request: "listparticipants",
			room: this.parent.conversation
		};
		sfu.send({ 
			"message" : message,
			success: (result) => {
				$.each(result.participants, (k, p) => {
					if (
						p.display !== this.parent.domain &&
						Object.keys(this.parent.currentVideoUsers()).includes(p.display)
					) {
						this.subscribe(p);
					}
				});
			}    
		});
	}

	leave(sfu) {
		let message = {
			request: "leave"
		};
		sfu.send({ message: message });
	}

	async publish(type=false) {
		let sfu = this.sfu;
		let published = "main";
		let media = { video: "video", audioRecv: false, videoRecv: false, audioSend: true, videoSend: true };
		let message = { request: "configure", audio: true, video: true };

		let done = new Promise(resolve => {
			if (type == "screen") {
				this.init("screen").then(() => {
					sfu = this.sfu2;
					published = "screen";
					media = { video: "screen", audioRecv: false, videoRecv: false, audioSend: false, videoSend: true };
					message = { request: "configure", audio: false, video: true };
					resolve();
				});
			}
			else {
				resolve();
			}
		});
		await done;

		sfu.createOffer({
			media: media,
			success: (jsep) => {
				sfu.send({ message: message, jsep: jsep });
				if (type !== "screen") {
					sfu.muteVideo();
					sfu.muteAudio();
				}
			}
		});
	}

	unpublish(type=false) {
		let message = {
			request: "unpublish"
		};
		if (type) {
			switch (type) {
				case "video":
					if (this.sfu) {
						this.sfu.send({ message: message });
					}
					break;

				case "screen":
					if (this.sfu2) {
						this.sfu2.send({ message: message });
					}
					break;
			}
		}
		else {
			if (this.sfu) {
				this.sfu.send({ message: message });
			}
			if (this.sfu2) {
				this.sfu2.send({ message: message });
			}

			$(".controls > .button").addClass("muted");
		}
	}

	toggleScreen() {
		let muted = $(".controls .button[data-action=toggleScreen]").hasClass("muted");
		if (muted) {
			if (!$(".screen").hasClass("shown")) {
				this.publish("screen");
			}
		}
		else {
			this.unpublish("screen");
		}
		this.dish.resize();
	}

	addCam(id, jid) {
		if (!$(`.cam[data-id=${id}]`).length) {
			let html = $(`
	   			<div class="cam" data-id="${id}" data-jid="${jid}">
	   				<div class="background"></div>
	   				<video autoplay playsinline></video>
	   				<div class="info">
		   				<table></table>
	   				</div>
	   			</div>
			`);
			let row = $(`#users .users tr[data-id="${id}"]`).clone();
			row.append($(`
				<td>
					<div class="icon voice"></div>
				</td>
			`));
			html.find("table").append(row);

			let row2 = $(`#users .users tr[data-id="${id}"]`).clone();
			html.find(".background").append(row2);

			if (id == this.parent.domain) {
				html.find("video")[0].muted = true;
				html.addClass("me");
			}

			$(".videoHolder .cams").append(html);
		}
		if (id && jid) {
			this.parent.ui.setData($(`.cam[data-id=${id}]`), "jid", jid);
		}
		this.dish.resize();
	}

	attachVideo(id, video) {
		Janus.attachMediaStream($(`.cam[data-id=${id}] video`).get(0), video);
		this.dish.resize();
		this.dish.resize();
	}

	attachScreen(id, video) {
		let html = $(`.videoHolder .screen`);
		let table = html.find("table");

		let row = $(`#users .users tr[data-id="${id}"]`).clone();
		table.empty();
		table.append(row);

		let screen = html.find("video").get(0);
		screen.muted = true;
		Janus.attachMediaStream(screen, video);
		$(".screen").addClass("shown");
		this.dish.resize();
		this.dish.resize();
	}

	removeCam(id) {
		$(`.cam[data-id=${id}]`).remove();
		this.dish.resize();
	}

	removeScreen() {
		$(".screen").removeClass("shown");
		this.dish.resize();
	}

	mute(type, bool) {
		switch (type) {
			case "audio":
				if (bool) {
					this.sfu.muteAudio();
				}
				else {
					this.sfu.unmuteAudio();
				}
				break;

			case "video":
				if (bool) {
					this.sfu.muteVideo();
				}
				else {
					this.sfu.unmuteVideo();
				}
				break;
		}
	}

	talking(id, bool) {
		if (bool) {
			$(`.cam[data-jid=${id}]`).addClass("talking");
		}
		else {
			$(`.cam[data-jid=${id}]`).removeClass("talking");
		}
	}

	close() {
		// UI sofort aufräumen
		$(".cam").remove();
		$(".screen").removeClass("shown");

		// Screen-Share vollständig beenden
		if (this.sfu2) {
			try {
				this.sfu2.hangup(true);
			}
			catch (e) {}

			try {
				this.sfu2.detach();
			}
			catch (e) {}

			this.sfu2 = null;
		}

		if (this.janus2) {
			try {
				this.janus2.destroy({
					cleanupHandles: true
				});
			}
			catch (e) {}

			this.janus2 = null;
		}

		// Kamera + Mikrofon vollständig beenden
		if (this.sfu) {
			try {
				this.sfu.hangup(true);
			}
			catch (e) {}

			try {
				this.sfu.detach();
			}
			catch (e) {}

			this.sfu = null;
		}

		if (this.janus) {
			try {
				this.janus.destroy({
					cleanupHandles: true
				});
			}
			catch (e) {}

			this.janus = null;
		}

		// Video-Elemente ebenfalls leeren
		$(".videoHolder video").each(function() {
			try {
				this.pause();
				this.srcObject = null;
			}
			catch (e) {}
		});

		$(".controls > .button").addClass("muted");

		this.dish.resize();
	}
}














