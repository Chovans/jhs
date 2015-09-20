var Fiber = require("fibers");
require("colors");
require("./global/$.String");
require("./global/Tools");
require("./global/Console");

function noop() {};
var cacheMap = {};
var fss = require("./fss");
var filetype = require("./filetype");
var _file_cahce_prefix_ = Math.random().toString(32).substr(2) + ":";
var _clock_cahce_prefix_ = Math.random().toString(32).substr(2) + ":";

function format_state(state) {
	return JSON.stringify(state);
};

function equal_state(state_1, state_2) {
	return state_1 === state_2;
};
var delay_time = Object.create(null);
var cache = {
	cache: cacheMap,
	options: {
		file_cache_time: 500
	},
	getCache: function(key) {
		return cacheMap[key];
	},
	buildCache: function(key, default_value) {
		return cacheMap[key] || (cacheMap[key] = default_value);
	},
	setCache: function(key, value) {
		return (cacheMap[key] = value);
	},
	delaySetCache: function(key, value, time) {
		setTimeout(function() {
			cacheMap[key] = value
		}, time);
		return value;
	},
	setTimeDelaySetCache: function(key, value, time) {
		if (!delay_time[key]) {
			delay_time[key] = setTimeout(function() {
				cacheMap[key] = value
			}, time);
		}
		return delay_time[key];
	},
	clearTimeDelaySetCache: function(key) {
		clearTimeout(delay_time[key])
	},
	removeCache: function(key) {
		return cache.setCache(key, void 0);
	},

	//原理：@Gaubee [高效文件缓存机制的实现](https://github.com/Gaubee/blog/issues/81)
	//现在使用ClockCache进行实现
	getFileCache: function(pathname, time_out) {
		var file_key = _file_cahce_prefix_ + pathname;
		if (!cache.hasClockCache(file_key)) {
			var pre_state = {};
			cache.defineClockCache(file_key, "time_and_before", {
				get_value_handle: function(_update_cache) {
					console.log("[ file:read ]".colorsHead(), "read file", "=>", pathname, "\n");
					var file_cache = {};
					file_cache.source_content = fss.readFileSync(pathname);
					if (!filetype(file_cache.source_content)) {
						file_cache.is_text = true;
						file_cache.source_content = file_cache.source_content.toString();
					}
					file_cache.source_md5 = $$.md5(file_cache.source_content);
					_update_cache(file_cache);
				},
				before_get_value_handle: function(_update_cache, next) {
					console.log("before_get_value_handle",pathname)
					var current_state = format_state(fss.lstatSync(pathname));
					console.group("[ file:read ]".colorsHead(), "=>", pathname);
					// if (this.is_timeout) //must be true
					console.log("文件缓存超时，重新检测缓存可用性");

					if (!equal_state(current_state, pre_state)) {
						if (this.is_latest) {
							console.log("文件已经被修改，缓存无效");
						} else {
							console.log("初始化文件缓存");
						}
						pre_state = current_state;
						_update_cache();
					} else {
						console.log("文件未被修改，继续使用文件缓存");
						_update_cache(cache.NO_UPDATE_CLOCKCACHE);
					}
					console.groupEnd("[ file:read ]".colorsHead(), "\n");
					next();
				},
				time: parseInt(time_out) || cache.options.file_cache_time,
				// debug: true
			});
		}
		var fiber = Fiber.current;
		cache.getClockCache(file_key, function(file_cache) {
			fiber.run(file_cache)
		});
		var file_cache = Fiber.yield();
		return file_cache;
	},
	getFileCacheContent: function(pathname) {
		return cache.getFileCache(pathname).source_content
	},
	/*
	 * 四种缓存模式
	 * 1. normal
	 *    要求参数 : get_value_handle(retrun_cb, _update_cache)
	 * 2. time
	 *    要求参数 : get_value_handle(return_cb)
	 *               time
	 * 3. bofore
	 *    要求参数 : get_value_handle(return_cb)
	 *               before_get_value_handle(_update_cache, then)
	 * 4. time_and_before（如果before_handle的性能开销过大，应使用这种混合模式）
	 *    要求参数 : get_value_handle(return_cb)
	 *               time
	 *               before_get_value_handle(_update_cache, then)
	 */
	defineClockCache: function(key, type, options) {
		options || (options = {});
		var _clock_key = _clock_cahce_prefix_ + key;
		var res = {
			key: key,
			debug: options.debug ? console.log : noop,
			value: void 0,
			is_latest: false
		};
		type = type.toLowerCase();
		if (typeof options.get_value_handle !== "function") {
			throw new TypeError("typeof get_value_handle should be function");
		}
		//简单模式，事件通知式的更新方案
		if (type === "n" || type === "normal") {
			res.type = "normal";
			res.get_value_handle = options.get_value_handle;
		} else { //手动更新式，比较复杂
			if (type === "t" || type === "time" || type === "tb" || type === "time_and_before") {
				res.type = "time";
				res.get_value_handle = options.get_value_handle;
				//是否在时间到的时候清除缓存，默认FALSE。
				res.clear_cache_when_time_out = !!options.clear_cache_when_time_out;

				if (typeof options.time === "string" && options.time == parseInt(options.time)) {
					options.time = parseInt(options.time);
				}
				if (typeof options.time !== "number") {
					throw new TypeError("typeof time should be number");
				};
				var _mm_time = options.time;
				var _time_fun = (typeof options.time_fun === "function") && options.time_fun;

				res.time = function _time_core(_update_cache) {
					res.is_timeout = false;
					res.time = noop;
					if (_time_fun) {
						var self = this;
						var args = Array.prototype.slice.call(arguments);
						_update_cache = function() {
							return _time_fun.apply(this, args);
						}
					}
					setTimeout(function() {
						res.time = _time_core;
						_update_cache(res.clear_cache_when_time_out ? (void 0) : cache.TIMEOUT_CLOCKCACHE);
					}, _mm_time);
				};
			}
			if (type === "b" || type === "bofore" || type === "tb" || type === "time_and_before") {
				res.type = "bofore";
				res.get_value_handle = options.get_value_handle;
				if (typeof options.before_get_value_handle !== "function") {
					throw new TypeError("typeof before_get_value_handle should be function");
				}
				res.before_get_value_handle = options.before_get_value_handle;
			}
			if (type === "tb" || type === "time_and_before") {
				res.type = "time_and_before";
			}
		}
		cache.setCache(_clock_key, res);
	},
	hasClockCache: function(key) {
		var _clock_key = _clock_cahce_prefix_ + key;
		var res = cache.getCache(_clock_key);
		return !!res;
	},
	NO_UPDATE_CLOCKCACHE: {},
	TIMEOUT_CLOCKCACHE: {},
	getClockCache: function(key, return_cb) {
		var _clock_key = _clock_cahce_prefix_ + key;
		var res = cache.getCache(_clock_key);
		if (!res) {
			throw "Clock Cache should be define bofore get";
		}

		function _update_cache(val) {
			if (val === cache.NO_UPDATE_CLOCKCACHE) {
				return;
			}
			if (val === cache.TIMEOUT_CLOCKCACHE) {
				res.is_timeout = true;
				return;
			}
			res.is_latest = !!arguments.length
			res.value = val;
		};

		function _use_cache() {
			res.debug && res.debug("[ CC   ] Use Cache => ".colorsHead() + key + "\n");
			var val = res.value;
			process.nextTick(function() {
				return_cb(val);
			});
		};

		function _wrap_return_cb(val) {
			res.debug && res.debug("[ CC   ] Mod Cache => ".colorsHead() + key + "\n");
			res.is_latest = true
			res.value = val;
			process.nextTick(function() { //确保统一的异步行为
				return_cb(val);
			});
		};
		switch (res.type) {
			case "normal":
				if (res.is_latest) {
					_use_cache()
				} else {
					res.get_value_handle(_wrap_return_cb, _update_cache);
				}
				break;
			case "time":
				if (!res.is_timeout && res.is_latest) {
					_use_cache();
				} else {
					res.get_value_handle(function(val) {
						_wrap_return_cb(val);
					}, _update_cache);
				}
				//定时清除缓存
				res.time(_update_cache);
				break;
			case "bofore":
				res.before_get_value_handle(_update_cache, function() {
					if (res.is_latest) {
						_use_cache();
					} else {
						res.get_value_handle(_wrap_return_cb, _update_cache);
					}
				});
				break;
			case "time_and_before":
				if (!res.is_timeout && res.is_latest) {
					_use_cache();
				} else {
					res.before_get_value_handle(_update_cache, function() {
						if (res.is_latest) {
							_use_cache();
						} else {
							res.get_value_handle(function(val) {
								_wrap_return_cb(val);
							}, _update_cache);
						}
					});
				}
				//定时清除缓存
				res.time(_update_cache);
		}
	}
};
module.exports = cache;
