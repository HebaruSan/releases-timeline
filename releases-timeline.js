var lastUserSearch = '';

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

function handleError(status)
{
	switch (status) {
		case 403:
			SetMessage("Too many GitHub API requests, throttled");
			break;
		case 404:
			SetMessage("Not found");
			break;
		default:
			SetMessage("Error " + status);
			break;
	}
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
						setOptions(validArray.map(function(r) {return user + "/" + r.name;}));
					} else {
						SetMessage("No repositories have releases");
					}
					showBack(true);
				});
			} else {
				SetMessage("Repository not found: " + search);
			}
			showBack(true);
		},
		handleError
	);
}

function hasReleasesFilter(inArray, index, outArray, onDone)
{
	if (index >= inArray.length) {
		onDone(outArray);
	} else {
		checkForReleases(
			inArray[index].full_name,
			function() {
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
				ifYes();
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
		function(status) {
			switch (status) {
				case 404:
					// Search for repositories if nothing matched this text exactly
					findRepos(search);
					break;
				default:
					handleError(status);
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

function SetMessage(msg)
{
	var content = document.getElementById('content');
	content.parentNode.replaceChild(content.cloneNode(false), content);
	var content = document.getElementById('content');
	content.appendChild(elt('div', '', 'msg', [msg]));
	document.getElementById('total-downloads').innerHTML = '';
	showBack(false);
}

var database = [];

function mkTimeline(releaseArray)
{
	if (!(releaseArray instanceof Array)) {
		SetMessage(releaseArray.message);
		showBack(true);
		return;
	}
	if (releaseArray.length < 1) {
		SetMessage("No releases found");
		showBack(true);
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
	var total_downloads = 0;
	for (var i = 0; i < releaseArray.length; ++i) {
		var rel = releaseArray[i];
		total_downloads += dlCount(rel);
		var start = rel.published_at;
		data.push({
			id:      i,arth 1.000
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
	document.getElementById('total-downloads').innerHTML = "Total downloads: " + total_downloads;
	showBack(true);
}

function timelineEntry(release)
{
	return elt('div', '', 'tlEntry', [
		elt('div', '', 'ver', [release.tag_name]),
		elt('div', '', 'num', [""+dlCount(release)])
	]);
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
	menu.style.display = ((menu.style.display === "none") ? "block" : "none");
}

function setTheme(which)
{
	document.body.className = which;
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
	var xhr = new XMLHttpRequest();
	xhr.onload = (function(callback) {
		return function(evt) {
			if (this.status === 200) {
				callback(JSON.parse(this.responseText));
			} else {
				errCallback(this.status);
			}
		};
	})(callback);
	xhr.open('GET', url, true);
	xhr.setRequestHeader('Content-Type', 'application/json');
	xhr.send(JSON.stringify(jsonPayload));
}

window.addEventListener('load', function() {
	doSearch(document.getElementById('searchbox').value);
});

document.addEventListener('click', function(evt) {
	var menu = document.getElementById('menu');
	var hamburger = document.getElementById('hamburger');
	if (!descendent_of(menu, evt.target)
			&& !descendent_of(hamburger, evt.target)) {
		menu.style.display = "none";
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
