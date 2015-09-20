var fs = require("fs");
var fss = Object.create(fs);
var http = require("http");
fss.existsSync = function(file_paths) {
	if (Array.isArray(file_paths)) {
		return file_paths.some(function(filepath) {
			return fss.existsSync(filepath)
		});
	} else {
		if (file_paths.indexOf("http") == 0) {
			var fiber = Fiber.current;
			var req = http.get(file_paths, function(res) {
				req.abort();
				fiber.run(res.statusCode != 404);
			});
			return Fiber.yield();
		} else {
			return fs.existsSync(file_paths)
		}
	}
};
fss.existsFileInPathsSync = function(file_paths, filename) {
	return file_paths.some(function(filepath) {
		return fss.existsSync(filepath + "/" + filename)
	});
};
fss.lstatSync = function function_name(file_paths) {
	if (Array.isArray(file_paths)) {
		return file_paths.map(function(filepath) {
			return fss.lstatSync(filepath)
		});
	} else {
		if (file_paths.indexOf("http") == 0) {
			var fiber = Fiber.current;
			var req = http.get(file_paths, function(res) {
				req.abort();
				fiber.run({
					mtime: res.headers["last-modified"],
					size: res.headers["content-length"]
				});
			});
			return Fiber.yield();
		} else {
			return fs.lstatSync(file_paths)
		}
	}
};


var _new_file_placeholder_ = "_NEW_FILE_PLACEHOLDER_" + Math.random().toString(36).substr(2);

function _mix_file(file_paths, index) {
	index = ~~index;
	return file_paths[index] ? fss.readFileSync(file_paths[index])
		.replace(_new_file_placeholder_, function() {
			return _mix_file(file_paths, index + 1)
		}) : "";
};
fss.readFileSync = function function_name(file_paths) {
	if (Array.isArray(file_paths)) {
		return _mix_file(file_paths)
	} else {
		if (file_paths.indexOf("http") == 0) {
			var fiber = Fiber.current;
			var req = http.get(file_paths, function(res) {
				if (res.statusCode == 404) {
					fiber.run(_new_file_placeholder_);
				} else {
					var result = "";
					res.on("data", function(chunk) {
						result += chunk;
					}).on("end", function() {
						fiber.run(result);
					});
				}
			});
			return Fiber.yield();
		} else {
			return fs.readFileSync(file_paths)
		}
	}
}
module.exports = fss;