var fs = require("fs");
var Fiber = require("fibers");
var path = require("path");
var base_config = require("./_base");
var common = require("./_common");
var NunBuilder = require("../nunjucks_builder");
var jhs = require("../../index");

var bus_jhs_options = {
	"js_minify": base_config.js_minify,
	"css_minify": base_config.css_minify,
	"html_minify": base_config.html_minify,
	root: base_config.bus_root,
	index: "app.html",
	"404": "app.html", //错误页也自动导向主页，而后用JS进行动态加载404页面
	template_map: Object.create(null),
	md5_map: Object.create(null),
	template_path_replace: {
		from: "/usr/local/gitDepot",
		to: "http://dotnar.com:8081"
	},
	get_file_path: function(req, res, pathname) {
		// 文件请求的优先级
		//一种继承的形式
		var _root = [
			base_config.bus_root,
			req.is_mobile ? base_config.default_mobile_template_root : base_config.default_pc_template_root,
			// req.is_mobile ? req.mobile_template_root : req.pc_template_root
		];
	},
	before_filter: function(req, res) {
		var _is_mobile;
		var _is_weixin;
		var _user_agent = req.header("user-agent");
		_is_mobile = req.is_mobile = $$.isMobile(_user_agent);
		if (_is_mobile) {
			_is_weixin = req.is_weixin = $$.isWeiXin(_user_agent);
		}
		//TODO: 请求 配置信息、商家信息，进行正确路由配置
		var render_data = common.getRenderData({
			type: "get-dotnar_render_data",
			host: req.headers["referer-host"],
			data_list: ["appConfig", "busInfo"],
			cookie: req.headers["cookie"]
		});
		if (render_data.busInfo._id === "jewel") {
			res.template_root = _is_mobile ? "/usr/local/gitDepot/jewel/" : base_config.default_pc_template_root;
		} else if (render_data.busInfo.permission.data_pc_template_name || render_data.busInfo.permission.data_mobile_template_name) {
			res.template_root = common.getTemplatePaths(_is_mobile ? render_data.busInfo.permission.data_mobile_template_name : render_data.busInfo.permission.data_pc_template_name, bus_jhs_options)
			if (!(Array.isArray(res.template_root) && res.template_root.length > 0)) {
				res.template_root = null;
			}
		}
		if (!res.template_root) {
			res.template_root = _is_mobile ? base_config.default_mobile_template_root : base_config.default_pc_template_root;
		}
		//配置默认的继承关系
		if (String.isString(res.template_root)) {
			res.template_root = [res.template_root, base_config.bus_root];
		}

		var _extend_reader_data = res.extend_reader_data || (res.extend_reader_data = {});
		_extend_reader_data.is_mobile = _is_mobile;
		_extend_reader_data.is_weixin = _is_weixin;

		res.bus_root = bus_jhs_options.root = res.template_root;
		// console.log("bus_jhs_options.root:", bus_jhs_options.root)
	},
	common_filter_handle: function(pathname, params, req, res) {
		if (!res.is_text) {
			return;
		}
		if (res.text_file_info.extname === ".html" && res.statusCode == 404 && fs.existsSync(res.template_root + "/app-pages/pages" + pathname)) {
			console.log("前端自动二次路由，404 => 200")
			res.status(200); //找得到，不是真正的404
		}

		var body_ma5 = $$.md5(res.body);
		var template_map = this.template_map;
		var md5_map = this.md5_map;
		if (md5_map[pathname] !== body_ma5) { //MD5校验，如果文件已经发生改变，则清除模板重新编译
			template_map[pathname] = null;
		}

		//请求 配置信息、商家信息
		var render_data = common.getRenderData({
			type: "get-dotnar_render_data",
			host: req.headers["referer-host"],
			data_list: ["appConfig", "busInfo"],
			cookie: req.headers["cookie"]
		});

		//编译模板
		var tmp = NunBuilder.compileTemplate(res.body, NunBuilder.buildBusEnv(res.bus_root, {
			req: req,
			res: res,
			get_file_path: this.get_file_path,
		}));

		//渲染文件
		try {
			res.body = tmp.render(req.extend_reader_data ? render_data.$mix(req.extend_reader_data) : render_data);
		} catch (e) {
			console.log("[Nunjucks Render Error]".colorsHead(), "=>", pathname, ">>", String(e), res.bus_root);
			res.status(502);
			res.body = "";
		}
	}
};
module.exports = bus_jhs_options;