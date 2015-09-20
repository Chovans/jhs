var Fiber = require("fibers");
require("./lib/global")
var express = require("express");
var compression = require('compression');
var filter = require("./lib/filter");
var cache = require("./lib/cache");
var fss = require("./lib/fss");
var fs = require("fs");
var path = require("path");
var jhs = express();
jhs.fs = fss;
var mime = require("mime-types");
var tld = require("tldjs");
var TypeScriptSimple = require('typescript-simple').TypeScriptSimple;
var sass = require('node-sass');
var CleanCSS = require('clean-css');
var UglifyJS = require("uglify-js");
var _404file;

function _get_404_file() {
	return cache.getFileCacheContent(__dirname + "/lib/404.html");
};
/*
 * 初始化
 */
jhs.use(compression());
jhs.cache = cache;

/*
 * 配置
 */
jhs.options = {};
jhs.filter = function(path, callback, options) {
	var f = filter.get(path, options);
	f.addHandle(callback);
};
/*
 * 包装的过滤器
 */
jhs.emit_filter = function(path, req, res, end) {
	var extend_args = Array.prototype.slice.call(arguments, 1);
	var _is_match_someone;
	filter.cache.some(function(f) {
		if (f.math(path)) {
			var args = [path, f.params, req, res];
			_is_match_someone = true;
			return f.emitHandle.apply(f, args);
		}
	});
	if (_is_match_someone) {
		end && end();
	} else {
		console.error("找不到任何路由匹配信息", path);
		res.set('Content-Type', mime.contentType("html"));
		res.status(404).end(_get_404_file());
	}
};
/*
 * 缓存操作工具
 */
for (var _handle_name in cache) {
	if (cache.hasOwnProperty(_handle_name)) {
		var _handle = cache[_handle_name];
		if (_handle instanceof Function) {
			jhs[_handle_name] = _handle.bind(cache);
		}
	}
}
/*
 * 核心监听转发器
 */
jhs.all("*", function(req, res, next) {
	var referer = req.header("referer");
	if (!referer) {
		referer = "http://" + req.header("host") + "/";
	}
	http_header = referer.indexOf("https://") === 0 ? "https://" : "http://"
	var host = referer.replace(http_header, "").split("/")[0];
	if (host) {
		var origin = http_header + host;
	} else {
		origin = req.header("origin");
		host.replace(http_header, "");
	}
	var domain = tld.getDomain(origin) || "";
	req.headers["referer"] = referer;
	req.headers["origin"] = origin;
	req.headers["referer-host"] = host;
	req.headers["domain"] = domain;
	req.headers["protocol"] = http_header.replace("://", "");
	Fiber(function() {
		jhs.emit("before_filter", req, res);
		/*
		 * 路由起始点
		 */
		jhs.emit_filter(req.path, req, res, function() {
			res.end(res.body || "");
		});
	}).run();
});
/*
 * 基础规则监听
 */
// filename.ext
jhs.filter("*.:type(\\w+)", function(pathname, params, req, res) {
	var type = params.type;
	console.log("常规路由", pathname);

	_route_to_file(jhs.options.root || __dirname, pathname, type, pathname, params, req, res);
	return true;
});
// root/
jhs.filter(/^(.*)\/$\/?$/i, function(pathname, params, req, res) {
	var res_pathname = path.normalize(pathname + (jhs.options.index || "index.html"));

	console.log("目录型路由", pathname, "\n\t进行二次路由：", res_pathname);

	// var type = path.extname(res_pathname).substr(1);

	// _route_to_file(jhs.options.root || __dirname, res_pathname, type, pathname, params, req, res);

	//处理后的地址再次出发路由，前提是不死循环触发
	if (res_pathname.charAt(res_pathname.length - 1) !== "/") {
		jhs.emit_filter(res_pathname, req, res);
	}
	return true;
});
//通用文件处理
function _route_to_file(file_paths, res_pathname, type, pathname, params, req, res) {
	/*
	 * file_paths 目录或者目录列表
	 * res_pathname 真正要返回的文件
	 * pathname URL请求的文件，不代表最后要返回的文件
	 */

	console.log(("[ " + type.placeholder(5) + "]").colorsHead(), "=>", pathname.placeholder(60, "\n\t"), "=>", file_paths, res_pathname, "\n")

	if (!fss.existsFileInPathsSync(file_paths, pathname)) {
		res.status(404);
		var _404file_name = jhs.options["404"] || "404.html";
		if (!fss.existsFileInPathsSync(file_paths, _404file_name)) {
			res.set('Content-Type', mime.contentType("html"));
			res.body = _get_404_file();
			return;
		}
		res_pathname = _404file_name;
	}

	var file_path = file_paths.map(function(filepath) {
		return filepath + "/" + res_pathname;
	});

	var content_type = mime.contentType(type);
	res.set('Content-Type', content_type);
	var fileInfo = cache.getFileCache(file_path);
	res.body = fileInfo.source_content;


	if (fileInfo.is_text) {
		var _extname = path.extname(res_pathname);
		var _filename = path.basename(res_pathname);
		var _basename = path.basename(res_pathname, _extname);
		res.is_text = true;
		res.text_file_info = {
			filename: _extname,
			basename: _filename,
			extname: _basename,
		};
	}

	(jhs.options.common_filter_handle instanceof Function) && jhs.options.common_filter_handle(pathname, params, req, res);

	jhs.emit("*." + type, pathname, params, req, res);

	/*
	 * 用户自定义的处理完成后再做最后的处理，避免nunjucks的include、import指令导入的内容没有处理
	 */
	if (fileInfo.is_text) {
		res.body = res.body.replaceAll("__pathname__", pathname)
			.replaceAll("__res_pathname__", res_pathname)
			.replaceAll("__filename__", _filename)
			.replaceAll("__basename__", _basename)
			.replaceAll("__extname__", _extname);
		var _lower_case_extname = _extname.toLowerCase();
		var _lower_case_compile_to = req.query.compile_to;
		_lower_case_compile_to = (_lower_case_compile_to || "").toLowerCase();
		/* TYPESCRIPT编译 */
		if (_lower_case_extname === ".ts" && /js|\.js/.test(_lower_case_compile_to)) {
			if (fileInfo.compile_tsc_content) {
				res.body = fileInfo.compile_tsc_content;
			} else {
				var tss = new TypeScriptSimple({
					sourceMap: jhs.options.tsc_sourceMap
				});
				var tsc_compile_resule = tss.compile(res.body, path.parse(_file_path).dir)
			}
		}
		/* SASS编译 */
		if (_lower_case_extname === ".scss" && /css|\.css/.test(_lower_case_compile_to)) {
			if (fileInfo.compile_sass_content) {
				res.body = fileInfo.compile_sass_content;
			} else {
				var sass_compile_result = sass.renderSync({
					data: res.body,
					includePaths: [path.parse(_file_path).dir]
				});
				res.body = fileInfo.compile_sass_content = sass_compile_result.css.toString();
			}
			//文件内容变为CSS了，所以可以参与CSS文件类型的处理
			extname = ".css";
		}
		/* CSS压缩 */
		if (jhs.options.css_minify && _lower_case_extname === ".css") {
			if (fileInfo.minified_css_content) {
				res.body = fileInfo.minified_css_content;
			} else {
				var fiber = Fiber.current;
				new CleanCSS().minify(res.body, function(err, minified) {
					if (err) {
						console.log("[CleanCSS Minify Error]".colorsHead(), "=>", err);
					}
					res.body = fileInfo.minified_css_content = minified.styles;
					if (minified.errors.length + minified.warnings.length) {
						minified.errors.forEach(function(err) {
							console.log("[CSS Error]".colorsHead(), "=>", err);
						});
						minified.warnings.forEach(function(war) {
							console.log("[CSS Warn]".colorsHead(), "=>", war);
						});
					}
					fiber.run();
				});
				Fiber.yield();
			}
		}
		/* JS压缩 */
		if (jhs.options.js_minify && _lower_case_extname === ".js") {
			if (fileInfo.minified_js_content) {
				res.body = fileInfo.minified_js_content;
			} else {
				var js_minify_result = UglifyJS.minify(res.body, {
					fromString: true
				});
				res.body = fileInfo.minified_js_content = js_minify_result.code;
			}
		}
		/* HTML压缩 */
		if (jhs.options.html_minify && _lower_case_extname === ".html") {

		}
	}
};

module.exports = jhs;