var hist                 = [''];
var cache                = {};
var githubToken          = null;
var lastProgressDateTime = null;
var favorites            = [];
var cur_repo             = {};

function tokenChanged(token)
{
	githubToken = token;
	localStorage.setItem("githubToken", githubToken);
}

function doSearch(search)
{
	// Reset anything that's search-specific
	SetMessage("Loading...");
	document.getElementById('total-downloads').innerHTML = '';
	document.getElementById('orig-repo').style.display = "none";
	showHideFavorite();
	setPermalink();

	if (hist.length < 1 || hist[hist.length - 1] !== search) {
		hist.push(search);
	}

	// Now figure out what to load
	if (!search || search.length === 0) {
		list_favorites();
	} else if (!search.includes("/")) {
		findUsers(search);
	} else if (search[search.length - 1] === "/") {
		findRepos(search);
	} else { // "/" in middle of string
		findReleases(search);
	}
	document.getElementById('searchbox').focus();
}

function searchChanged(search)
{
	if (search === '') {
		doSearch(search);
	}
}

function showHideBack()
{
	var vis = hist.length > 1;
	document.getElementById('back').style.display = vis ? "block" : "none";
}

function back()
{
	// Remove current search from stack
	var inp = document.getElementById('searchbox');
	hist.pop();
	inp.value = (hist && hist.length > 0)
	 	? hist[hist.length - 1]
		: '';
	doSearch(inp.value);
}

function handleError(status, errors)
{
	switch (status) {
		case 403:
			SetMessage("Too many GitHub API requests, throttled; enter a token to bypass");
			menuClicked();
			document.getElementById('token').focus();
			break;
		case 404:
			SetMessage("Not found");
			break;
		default:
			if (errors && errors.length > 0) {
				SetMessage(errors.map(
					function(err) {
						return err.message;
					}).join(", "));
			} else {
				SetMessage("Error " + status);
			}
			break;
	}
	setProgress(1);
	showHideBack();
	setLinksFromSearch(true);
}

function findUsers(search)
{
	xhr_get(
		'https://api.github.com/search/users?q=' + search + "+in:login&sort=repositories&order=desc",
		{},
		function(users) {
			if (users && users.items) {
				setOptions(users.items.map(function(u) {return u.login + "/";}));
			} else {
				SetMessage("User not found: " + search);
			}
			showHideBack();
			setUser("");
			setRepo("");
		},
		handleError
	);
}

function findRepos(search)
{
	var pieces = search.split("/", 2);
	var user = pieces[0];
	var repo = pieces[1];
	xhr_get(
		'https://api.github.com/search/repositories?q=' + repo + "+in:name+fork:true+user:" + user + "&sort=stars&order=desc",
		{},
		function(repos) {
			if (repos && repos.items) {
				repos.items = repos.items.filter(function(r) { return r && r.has_downloads; });
				hasReleasesFilter(repos.items, 0, [], function(validArray) {
					if (validArray && validArray.length > 0) {
						setRepoOptions(validArray);
					} else {
						SetMessage("No repositories have releases");
					}
					showHideBack();
					setLinksFromSearch(true);
				});
			} else {
				SetMessage("Repository not found: " + search);
				showHideBack();
			}
		},
		handleError
	);
}

function setRepoOptions(repoArray)
{
	var content = document.getElementById('content');
	content.parentNode.replaceChild(content.cloneNode(false), content);
	var content = document.getElementById('content');
	if (repoArray && repoArray.length > 0) {
		var list = [];
		var totalsTotal = 0;
		for (var i = 0; i < repoArray.length; ++i) {
			if (!repoArray[i].total_downloads) {
				repoArray[i].total_downloads = totalDownloads(repoArray[i].releases);
			}
			totalsTotal += repoArray[i].total_downloads;
		}
		repoArray.sort(function(a, b) {
			return b.total_downloads - a.total_downloads;
		});
		for (var i = 0; i < repoArray.length; ++i) {
			list.push(elt('li', '', 'hit', [
				button('', 'choice', '', [
					elt('span', '', 'num right-float', '' + repoArray[i].total_downloads),
					elt('span', '', repoArray[i].fork ? 'octicon octicon-repo-forked' : 'octicon octicon-repo'),
					' ' + repoArray[i].full_name
				], (function(repo) {
					return function(evt) {
						document.getElementById('searchbox').value = repo.full_name;
						doSearch(repo.full_name);
					}
				})(repoArray[i]))
			]));
		}
		content.appendChild(elt('ul', 'results', '', list));
		document.getElementById('total-downloads').innerHTML = "Total downloads: " + totalsTotal;
	} else {
		SetMessage("Select a repository");
	}
}

function setProgress(fraction)
{
	var outer = document.getElementById('progress-bar-outer');
	var inner = document.getElementById('progress-bar-inner');
	if (fraction < 1) {
		outer.style.display  = 'block';
		inner.style.width    = (100 * fraction) + "%";

		var now = new Date();
		if (lastProgressDateTime) {
			var transMs = now - lastProgressDateTime;
			inner.style.transitionDuration = transMs + "ms";
		}
		lastProgressDateTime = now;

	} else {
		// Done, hide everything
		outer.style.display  = 'none';
		inner.style.width    = '0';
		lastProgressDateTime = null;
	}
}

function hasReleasesFilter(inArray, index, outArray, onDone)
{
	if (index >= inArray.length) {
		setProgress(1);
		onDone(outArray);
	} else {
		setProgress(index / inArray.length);
		checkForReleases(
			inArray[index].full_name,
			function(releaseArray) {
				inArray[index].releases = releaseArray;
				outArray.push(inArray[index]);
				hasReleasesFilter(inArray, index+1, outArray, onDone);
			},
			function() {
				hasReleasesFilter(inArray, index+1, outArray, onDone);
			}
		);
	}
}

function checkForReleases(search, ifYes, ifNo)
{
	xhr_get(
		'https://api.github.com/repos/' + search + '/releases',
		{},
		function(releaseArray) {
			if (releaseArray && releaseArray.length > 0) {
				ifYes(releaseArray);
			} else {
				ifNo();
			}
		},
		handleError
	);
}

function findReleases(search)
{
	xhr_get(
		'https://api.github.com/repos/' + search + '/releases',
		{},
		mkTimeline,
		function(status, errors) {
			switch (status) {
				case 404:
					// Search for repositories if nothing matched this text exactly
					findRepos(search);
					break;
				default:
					handleError(status, errors);
					break;
			}
		}
	);
}

function findForkSource(search)
{
	xhr_get(
		'https://api.github.com/repos/' + search,
		{},
		function(repo) {
			var e = document.getElementById('orig-repo');
			cur_repo.fork = repo.fork;
			if (repo.fork) {
				// Replace the button with a clone to purge its event listeners
				e.parentNode.replaceChild(e.cloneNode(true), e);
				var e = document.getElementById('orig-repo');
				e.title = repo.source.full_name;
				e.addEventListener('click', (function(repo) {
					return function(evt) {
						document.getElementById('searchbox').value = repo.source.full_name;
						doSearch(repo.source.full_name);
					}
				})(repo));
				e.style.display = "inline-block";
			} else {
				e.style.display = "none";
			}
		},
		handleError
	);
}

function setOptions(options)
{
	var content = document.getElementById('content');
	content.parentNode.replaceChild(content.cloneNode(false), content);
	var content = document.getElementById('content');
	var list = [];
	for (var i = 0; i < options.length; ++i) {
		list.push(elt('li', '', 'hit', [
			button('', 'choice', '', [options[i]], (function(opt) {
				return function(evt) {
					document.getElementById('searchbox').value = opt;
					doSearch(opt);
				}
			})(options[i]))
		]));
	}
	content.appendChild(elt('ul', 'results', '', list));
}

function setLinksFromSearch(repoIsFake)
{
	var pieces = document.getElementById('searchbox').value.split("/", 2);
	if (pieces[0] && pieces[0].length > 0) {
		setUser('https://github.com/' + pieces[0]);
		if (!repoIsFake && pieces[1] && pieces[1].length > 0) {
			setRepo('https://github.com/' + pieces[0] + '/' + pieces[1]);
		} else {
			setRepo("");
		}
	} else {
		setUser("");
		setRepo("");
	}
}

function setUser(url)
{
	if (url && url.length > 0) {
		var e = document.getElementById('user');
		e.href = url;
		e.style.display = "inline-block";
	} else {
		document.getElementById('user').style.display = "none";
	}
}

function setRepo(url)
{
	if (url && url.length > 0) {
		var e = document.getElementById('repo');
		e.href = url;
		e.style.display = "inline-block";
	} else {
		document.getElementById('repo').style.display = "none";
	}
}

function SetMessage(msg)
{
	var content = document.getElementById('content');
	content.parentNode.replaceChild(content.cloneNode(false), content);
	var content = document.getElementById('content');
	content.appendChild(elt('div', '', 'msg', msg));
	document.getElementById('total-downloads').innerHTML = '';
	showHideBack();
	setLinksFromSearch(true);
}

function mkTimeline(releaseArray)
{
	if (!(releaseArray instanceof Array)) {
		SetMessage(releaseArray.message);
		showHideBack();
		setLinksFromSearch();
		return;
	}
	if (releaseArray.length < 1) {
		SetMessage("No releases found");
		showHideBack();
		setLinksFromSearch();
		return;
	}
	findForkSource(document.getElementById('searchbox').value);
	releaseArray = releaseArray.map(function(rel) {
		rel.published_at = new Date(rel.published_at);
		return rel;
	});
	releaseArray.sort(function(a, b) {
		return b.published_at - a.published_at;
	});
	var data = [];
	var prev = new Date();
	for (var i = 0; i < releaseArray.length; ++i) {
		var rel = releaseArray[i];
		var start = rel.published_at;
		data.push({
			id:      i,
			start:   start,
			end:     prev,
			title:   rel.name,
			content: timelineEntry(rel)
		});
		prev = start;
	}
	var content = document.getElementById('content');
	content.parentNode.replaceChild(content.cloneNode(false), content);
	var content = document.getElementById('content');
	var timeline = new vis.Timeline(content, data, {
		showCurrentTime:  false,
		moveable:         false,
		selectable:       false,
		tooltip: {
			followMouse:  true
		}
	});
	timeline.on('click', function(props) {
		if (props.item !== null) {
			window.open(releaseArray[props.item].html_url);
		}
	});
	var tot_down = totalDownloads(releaseArray);
	document.getElementById('total-downloads').innerHTML = "Total downloads: " + tot_down;
	cur_repo.total_downloads = tot_down;
	showHideBack();
	setLinksFromSearch();
}

function timelineEntry(release)
{
	return elt('div', '', 'tlEntry', [
		elt('div', '', 'ver', release.tag_name),
		elt('div', '', 'num', "" + dlCount(release))
	]);
}

function totalDownloads(releaseArray)
{
	var total_downloads = 0;
	for (var i = 0; i < releaseArray.length; ++i) {
		total_downloads += dlCount(releaseArray[i]);
	}
	return total_downloads;
}

function dlCount(rel)
{
	if (rel && rel.assets && rel.assets[0]) {
		return rel.assets[0].download_count;
	}
	return 0;
}

function menuClicked()
{
	var menu = document.getElementById('menu');
	document.getElementById('token').value = githubToken;

	if (menu.style.display === "none") {

		menu.classList.add("anim-in");
		menu.style.display = "block";
		setTimeout(function() {
			menu.classList.remove("anim-in");
		}, 1);

	} else {

		menu.classList.add("anim-out");
		setTimeout(function() {
			menu.style.display = "none";
			menu.classList.remove("anim-out");
		}, 200);

	}
}

function setTheme(which)
{
	document.body.className = which;
	localStorage.setItem("theme", which);
}

function elt(name, id, className, children)
{
	var e = document.createElement(name);
	if (id       ) { e.id        = id;         }
	if (className) { e.className = className;  }
	if (children ) { addChildren(e, children); }
	return e;
}

function link(id, className, href, title, children)
{
	var e = elt('a', id, className, children);
	if (href ) { e.href  = href;  }
	if (title) { e.title = title; }
	return e;
}

function button(id, className, title, children, onClick)
{
	var b = elt('button', id, className, children);
	if (title  ) { b.title = title;                      }
	if (onClick) { b.addEventListener('click', onClick); }
	return b;
}

function addChildren(e, children)
{
	try {
		if (children) {
			if (typeof(children) === 'string') {
				e.appendChild(document.createTextNode(children));
			} else if (children.length) {
				for (var i = 0; i < children.length; ++i) {
					e.appendChild(
						(typeof(children[i]) === 'string')
							? document.createTextNode(children[i])
							: children[i]
					);
				}
			}
		}
	} catch (exc) { }
}

function xhr_get(url, jsonPayload, callback, errCallback)
{
	if (url in cache) {
		// We have already requested this URL before.
		// Re-use the result to save API accesses.
		callback(cache[url]);
	} else {
		var xhr = new XMLHttpRequest();
		xhr.onload = (function(callback) {
			return function(evt) {
				if (this.status === 200) {
					cache[url] = JSON.parse(this.responseText);
					callback(cache[url]);
				} else {
					if (this.responseText && this.responseText.length > 0) {
						errCallback(this.status, JSON.parse(this.responseText).errors);
					} else {
						errCallback(this.status);
					}
				}
			};
		})(callback);
		xhr.open('GET', url, true);
		xhr.setRequestHeader('Content-Type', 'application/json');
		if (githubToken && githubToken.length > 0) {
			xhr.setRequestHeader('Authorization', 'token ' + githubToken);
		}
		xhr.send(JSON.stringify(jsonPayload));
	}
}

window.addEventListener('load', function() {
	load_favorites();
	var s = document.getElementById('searchbox');
	s.value = get_param(document.URL, 'searchbox');
	doSearch(s.value);
	githubToken = localStorage.getItem("githubToken");
	var theme = localStorage.getItem("theme");
	if (theme) {
		setTheme(theme);
	}
	// Wire up events
	document.addEventListener('click', function(evt) {
		var menu = document.getElementById('menu');
		var hamburger = document.getElementById('hamburger');
		if (!descendent_of(menu, evt.target)
				&& !descendent_of(hamburger, evt.target)) {
			if (menu.style.display === "block") {
				menuClicked();
			}
		}
		return false;
	});
	document.getElementById('back').addEventListener('click', back);
	document.getElementById('hamburger').addEventListener('click', menuClicked);
	document.getElementById('searchbox').addEventListener('input', function(evt) {
		evt.preventDefault();
		searchChanged(this.value);
	});
	document.getElementById('token').addEventListener('input', function(evt) {
		evt.preventDefault();
		tokenChanged(this.value);
	});
	document.getElementById('searchform').addEventListener('submit', function(evt) {
		evt.preventDefault();
		doSearch(document.getElementById('searchbox').value);
	});
	document.getElementById('favorite').addEventListener('click', function(evt) {
		var pieces = document.getElementById('searchbox').value.split("/", 2);
		mk_favorite(pieces[0], pieces[1], cur_repo.fork, cur_repo.total_downloads);
	});
	document.getElementById('unfavorite').addEventListener('click', function(evt) {
		var pieces = document.getElementById('searchbox').value.split("/", 2);
		rm_favorite(pieces[0], pieces[1]);
	});

	// Find themes in the stylesheet, pattern: body.themeName { /* whatever */ }
	var themeRegex = new RegExp('^body\.([-a-zA-Z0-9_]+)$');
	for (var i = 0; i < document.styleSheets.length; ++i) {
		var stsh = document.styleSheets[i];
		// Stylesheet rules can be null or throw SecurityErrors.
		try {
			if (stsh.cssRules) {
				for (var j = 0; j < stsh.cssRules.length; ++j) {
					var rule = stsh.cssRules[j];
					if (rule.type === CSSRule.STYLE_RULE) {
						var matches = themeRegex.exec(rule.selectorText);
						if (matches !== null) {
							mkTheme(matches[1]);
						}
					}
				}
			}
		} catch (exc) { }
	}
});

function mkTheme(name)
{
	var list = document.getElementById('theme-list');
	var caption = name.replace(/\b\w/g, l => l.toUpperCase()).replace('-', ' ');
	addChildren(list, [
		button(name, 'active-' + name, null, caption, function(evt) {
			setTheme(name);
		}),
		' '
	]);
}

function get_param(url, param)
{
	return new URLSearchParams(new URL(url).search).get(param);
}

function descendent_of(container, contained)
{
	for (var elt = contained; elt; elt = elt.parentNode) {
		if (elt === container) {
			return true;
		}
	}
	return false;
}

function setPermalink()
{
	var pieces = document.getElementById('searchbox').value.split("/", 2);
	if (pieces && pieces.length > 1 && pieces[1].length > 0) {
		var pl = document.getElementById('permalink');
		pl.style.display = "inline-block";
		pl.href = location.protocol + location.host + location.port + location.pathname + "?searchbox=" + document.getElementById('searchbox').value;
	} else {
		document.getElementById('permalink').style.display = "none";
	}
}

/* Favorites */

function showHideFavorite()
{
	var pieces = document.getElementById('searchbox').value.split("/", 2);
	if (pieces && pieces.length > 1 && pieces[1].length > 0) {
		if (is_favorite(pieces[0], pieces[1])) {
			document.getElementById(  'favorite').style.display = "none";
			document.getElementById('unfavorite').style.display = "inline-block";
		} else {
			document.getElementById(  'favorite').style.display = "inline-block";
			document.getElementById('unfavorite').style.display = "none";
		}
	} else {
		document.getElementById(  'favorite').style.display = "none";
		document.getElementById('unfavorite').style.display = "none";
	}
}

function load_favorites()
{
	var favs = localStorage.getItem('favorites');
	if (favs) {
		favorites = JSON.parse(favs);
	}
}

function save_favorites()
{
	localStorage.setItem('favorites', JSON.stringify(favorites));
}

function is_favorite(user, repo)
{
	var full_name = user + "/" + repo;
	var fav = favorites.find(function(f) {
		return f.full_name === full_name
	});
	return fav !== undefined && fav !== null;
}

function mk_favorite(user, repo, fork, total_downloads)
{
	add_favorite(user, repo, {
		full_name:       user + "/" + repo,
		fork:            fork,
		total_downloads: total_downloads
	});
}

function add_favorite(user, repo, info)
{
	if (!is_favorite(user, repo)) {
		favorites.push(info);
		showHideFavorite();
		save_favorites();
	}
}

function rm_favorite(user, repo)
{
	if (is_favorite(user, repo)) {
		var full_name = user + "/" + repo;
		favorites = favorites.filter(function(f) {
			return f.full_name !== full_name;
		});
		showHideFavorite();
		save_favorites();
	}
}

function list_favorites()
{
	setRepoOptions(favorites);
}
