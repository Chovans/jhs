/*
 * JHS的模板语言，用来编译文件引用
 */

var fss = require("./fss")

function JhsTplBuilder(file_content, options) {
	if (!(this instanceof JhsTplBuilder)) {
		return new JhsTplBuilder(file_content, options)
	}
	this.file_content = file_content
	this.options = options
};

function _mix_file(file_paths, index) {
	index = ~~index;
	return file_paths[index] ? fss.readFileSync(file_paths[index])
		.replaceAll("__[JHS]_JS_NEW_LINE_IN_COMMENT__", "\n")
		.replaceAll("__[JHS]_CSS_NEW_LINE_IN_COMMENT__", "*/\n\n/*")
		.replaceAll("__[JHS]_HTML_NEW_LINE_IN_COMMENT__", "-->\n\n<!--")
		.replace("__[JHS]_SUPER_FILE_CONTENT__", function() {
			return _mix_file(file_paths, index + 1)
		}).replace(/__\[JHS\]_INCLUDE_FILE_\((.+)\)__/g, function(match_str, filename) {
			console.log(match_str, filename)
			return _mix_file(file_paths.map(function(old_filepath) {
				var new_filepath = old_filepath.split("/");
				new_filepath[new_filepath.length - 1] = filename
				new_filepath = new_filepath.join("/");
				return new_filepath
			}))
		}) : "";
};

JhsTplBuilder.prototype = {
	complie: function(file_paths, res_pathname) {
		
	}
}