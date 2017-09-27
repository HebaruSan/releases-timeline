var lastUserSearch = '';
var token = '';
var database = [];
var cache = {};
var lastProgressDateTime = null;
var githubToken = null;

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

	// Now figure out what to load
	if (!search || search.length === 0) {
		SetMessage("Select a repository");
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

function back()
{
	var inp = document.getElementById('searchbox');
	var val = inp.value;
	if (val.includes("/")) {
		if (val[val.length - 1] === "/") {
			// Listing a user's repos, go back to prev user search
			inp.value = lastUserSearch;
		} else {
			// Listing a repo, go back to the user
			inp.value = val.split("/", 2)[0] + "/";
		}
	} else {
		// Listing users, reset
		inp.value = '';
	}
	// Update the display to reflect the new search
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
	showBack(true);
	setLinksFromSearch();
}

function findUsers(search)
{
	xhr_get(
		'https://api.github.com/search/users?q=' + search + "+in:login&sort=repositories&order=desc",
		{},
		function(users) {
			if (users && users.items) {
				lastUserSearch = search;
				setOptions(users.items.map(function(u) {return u.login + "/";}));
			} else {
				SetMessage("User not found: " + search);
			}
			showBack(false);
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
		'https://api.github.com/search/repositories?q=' + repo + "+in:name+user:" + user + "&sort=stars&order=desc",
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
					showBack(true);
					setLinksFromSearch();
				});
			} else {
				SetMessage("Repository not found: " + search);
			}
			showBack(true);
			setLinksFromSearch();
		},
		handleError
	);
}

function setRepoOptions(repoArray)
{
	var content = document.getElementById('content');
	content.parentNode.replaceChild(content.cloneNode(false), content);
	var content = document.getElementById('content');
	var list = [];
	var totalsTotal = 0;
	for (var i = 0; i < repoArray.length; ++i) {
		repoArray[i].total_downloads = totalDownloads(repoArray[i].releases);
		totalsTotal += repoArray[i].total_downloads;
	}
	repoArray.sort(function(a, b) {
		return b.total_downloads - a.total_downloads;
	});
	for (var i = 0; i < repoArray.length; ++i) {
		list.push(elt('li', '', 'hit', [
			button('', 'choice', '', [
				elt('span', '', 'num right-float', ['' + repoArray[i].total_downloads]),
				repoArray[i].full_name
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

function showBack(vis)
{
	document.getElementById('back').style.display = vis ? "block" : "none";
}

function setLinksFromSearch()
{
	var search = document.getElementById('searchbox').value;
	var pieces = search.split("/", 2);
	if (pieces[0] && pieces[0].length > 0) {
		setUser('https://github.com/' + pieces[0]);
		if (pieces[1] && pieces[1].length > 0) {
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
	content.appendChild(elt('div', '', 'msg', [msg]));
	document.getElementById('total-downloads').innerHTML = '';
	showBack(false);
	setLinksFromSearch();
}

function mkTimeline(releaseArray)
{
	if (!(releaseArray instanceof Array)) {
		SetMessage(releaseArray.message);
		showBack(true);
		setLinksFromSearch();
		return;
	}
	if (releaseArray.length < 1) {
		SetMessage("No releases found");
		showBack(true);
		setLinksFromSearch();
		return;
	}
	releaseArray = releaseArray.map(function(rel) {
		rel.published_at = new Date(rel.published_at);
		return rel;
	});
	releaseArray.sort(function(a, b) {
		return b.published_at - a.published_at;
	});
	var data = [];
	var prev = new Date();
	database = releaseArray;
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
			window.open(database[props.item].html_url);
		}
	});
	document.getElementById('total-downloads').innerHTML = "Total downloads: " + totalDownloads(releaseArray);
	showBack(true);
	setLinksFromSearch();
}

function timelineEntry(release)
{
	return elt('div', '', 'tlEntry', [
		elt('div', '', 'ver', [release.tag_name]),
		elt('div', '', 'num', [""+dlCount(release)])
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
		if (children && children.length) {
			for (var i = 0; i < children.length; ++i) {
				e.appendChild(
					(typeof(children[i]) === 'string')
						? htmlNode(children[i])
						: children[i]
				);
			}
		}
	} catch (exc) { }
}

function htmlNode(html)
{
	var e = document.createElement('span');
	e.innerHTML = html;
	return e;
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
	doSearch(document.getElementById('searchbox').value);
	githubToken = localStorage.getItem("githubToken");
	var theme = localStorage.getItem("theme");
	if (theme) {
		setTheme(theme);
	}
});

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

function descendent_of(container, contained)
{
	for (var elt = contained; elt; elt = elt.parentNode) {
		if (elt === container) {
			return true;
		}
	}
	return false;
}
