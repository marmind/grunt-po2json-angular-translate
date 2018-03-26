/*
 * grunt-po2json-angular-translate
 * https://github.com/root/grunt-po2json-angular-translate
 *
 * Copyright (c) 2013 danielavalero
 * Licensed under the MIT license.
 */

'use strict';

var po = require('node-po');
var path = require('path');
var fs = require('fs');

//Taken from https://gist.github.com/liangzan/807712#comment-337828
var  rmDir = function(dirPath) {
    var files;
    try { files  = fs.readdirSync(dirPath); }
    catch(e) { return; }
    if (files.length > 0){
        for (var i = 0; i < files.length; i++) {
            var filePath = dirPath + '/' + files[i];
            if (fs.statSync(filePath).isFile()){
                fs.unlinkSync(filePath);
            }else{
                rmDir(filePath);
            }
        }

        fs.rmdirSync(dirPath);
    }
};

module.exports = function(grunt) {

    var replacePlaceholder = function(string, openingMark, closingMark, altEnabled) {
        if (closingMark !== undefined &&
            altEnabled &&
            string.indexOf(closingMark !== -1)) {
            if (string.indexOf(openingMark) !== -1) {
                var om = new RegExp(openingMark, "g");			
                string = string.replace(om, "{{");
                //string = string.replace(openingMark, "{{");
            }
            if (string.indexOf(closingMark) !== -1) {
                var cm = new RegExp(closingMark, "g");			
                string = string.replace(cm, "}}");
                //string = string.replace(closingMark, "}}");
            }
        }

        //If there is no closing mark, then we have standard format: %0,
        if (string.indexOf(closingMark === -1)) {
            var pattern = "\\%([0-9]|[a-z])";
            var re = new RegExp(pattern, "g");
            var index = string.indexOf(re);
            var substr = string.substr(index, index + 2);
            string = string.replace(re, "{{" + substr + "}}");
        }
        return string;
    };

    var replaceKeysInMessage = function(translation, table, keyReplaceRegex, replacement) {
        if (replacement) {
            translation = translation.replace(replacement[0], table[replacement[1]]);
        }
        var m = keyReplaceRegex.exec(translation),
            replace = [];
        if (m !== null) {
            while (m !== null) {
                replace.push(m);
                m = keyReplaceRegex.exec(translation);
            }
            for (var i = 0; i < replace.length; i++) {
                translation = replaceKeysInMessage(translation, table, keyReplaceRegex, replace[i]);
            }
        }
        return translation;
    };

    grunt.registerMultiTask('po2json_angular_translate', 'grunt plugin to convert po to angangular-translate format', function() {
        var options = this.options({
            pretty: false,
            fuzzy: false,
            cleanPrevStrings: false,
            upperCaseId: false,
            stringify: true,
            offset: 1,
            enableAltPlaceholders: true,
            placeholderStructure: ["{", "}"],
            keyReplaceRegex: /\[\[([^\]]+)\]\]/g,
            keyRegex: /[^\/]*(?=\.[^.]+($|\?))/
        });


        this.files.forEach(function(f) {
            var filepaths = f.src.filter(function(filepath) {
                // Warn on and remove invalid source files (if nonull was set).
                if (!grunt.file.exists(filepath)) {
                    grunt.log.warn('Po file "' + filepath + '" not found.');
                    return false;
                } else {
                    return true;
                }
            });


            if (filepaths.length === 0) {
                grunt.log.warn('Destination (' + f.dest + ') not written because src files were empty.');
                return;
            }

            if (options.cleanPrevStrings) {
                rmDir(f.dest);
            }

            var destPath = path.extname(f.dest);
            var singleFile = false;
            var singleFileStrings = {};
            var langKey = options.keyRegex.exec(f.dest)[0];
            var scriptStart = "";//"(function(g) {g.resources = g.resources || {};g.resources." + langKey + " = g.resources." + langKey + " || {};function apply(a,b) { for(var p in b) { if(b.hasOwnProperty(p)) { a[p] = b[p]; }}}apply(g.resources." + langKey + ", ";
            var scriptEnd = "";//");}(Act));";

            if (destPath !== "") { //It is just one file, we should put everything there
                singleFile = true;
            }

            filepaths.forEach(function(filepath) {
                // Read the file po content
                var file = grunt.file.read(filepath);
                var catalog = po.parse(file);
                var strings = {};

                for (var i = 0; i < catalog.items.length; i++) {
                    var item = catalog.items[i];
                    if (options.upperCaseId) {
                        item.msgid = item.msgid.toUpperCase();
                    }

                    if (item.msgid_plural !== null && item.msgstr.length > 1) {
                        var singular_words = item.msgstr[0].split(" ");
                        var plural_words = item.msgstr[1].split(" ");
                        var pluralizedStr = "";
                        var numberPlaceHolder = false;

                        if (singular_words.length !== plural_words.length) {
                            grunt.log.writeln('Either the singular or plural string had more words in the msgid: ' + item.msgid + ', the extra words were omitted');
                        }

                        for (var x = 0; x < singular_words.length; x++) {

                            if (singular_words[x] === undefined || plural_words[x] === undefined) {
                                continue;
                            }

                            if (plural_words[x].indexOf('%d') !== -1) {
                                numberPlaceHolder = true;
                                continue;
                            }

                            if (singular_words[x] !== plural_words[x]) {
                                var p = "";
                                if (numberPlaceHolder) {
                                    p = "# ";
                                    numberPlaceHolder = false;
                                }

                                var strPl = "PLURALIZE, plural, offset:" + options.offset;

                                pluralizedStr += "{" + strPl + " =2{" + p + singular_words[x] + "}" +
                                    " other{" + p + plural_words[x] + "}}";

                            } else {
                                pluralizedStr += singular_words[x];
                            }

                            if (x !== singular_words.length - 1) {
                                pluralizedStr += " ";
                            }
                        }

                        pluralizedStr = replacePlaceholder(pluralizedStr, options.placeholderStructure[0], options.placeholderStructure[1], options.enableAltPlaceholders);
                        strings[item.msgid] = pluralizedStr;
                        if (singleFile) {
                            singleFileStrings[item.msgid] = pluralizedStr;
                        }

                    } else {
                        var message = item.msgstr.length === 1 ? item.msgstr[0] : item.msgstr;
                        message = replacePlaceholder(message, options.placeholderStructure[0], options.placeholderStructure[1], options.enableAltPlaceholders);
                        strings[item.msgid] = message;
                        if (singleFile) {
                            singleFileStrings[item.msgid] = message;
                        }
                    }
                }
            });


            if (singleFile) {
                // grunt.log.writeln('Replace keys in messages');
                // for (var key in singleFileStrings) {
                    // if (singleFileStrings.hasOwnProperty(key)) {
                        // singleFileStrings[key] = replaceKeysInMessage(singleFileStrings[key], singleFileStrings, options.keyReplaceRegex);
                    // }
                // }
                grunt.file.write(f.dest, (options.stringify) ? scriptStart + JSON.stringify(singleFileStrings, null, (options.pretty) ? '   ' : '') + scriptEnd : scriptStart + singleFileStrings + scriptEnd);
                grunt.log.writeln('JSON file(s) created: "' + f.dest + '"');
            }
        });
    });

};
