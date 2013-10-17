'use strict';

angular.module(
		'sfchecks.project',
		[ 'sf.services', 'palaso.ui.listview', 'palaso.ui.typeahead', 'ui.bootstrap', 'sgw.ui.breadcrumb', 'palaso.ui.notice', 'palaso.ui.textdrop' ]
)
.controller('ProjectCtrl', ['$scope', 'textService', '$routeParams', 'sessionService', 'breadcrumbService', 'linkService', 'silNoticeService', 'projectService',
                            function($scope, textService, $routeParams, ss, breadcrumbService, linkService, notice, projectService) {
		var projectId = $routeParams.projectId;
		$scope.projectId = projectId;
		
		// Rights
		$scope.rights = {};
		$scope.rights.deleteOther = false; 
		$scope.rights.create = false; 
		$scope.rights.editOther = false; //ss.hasRight(ss.realm.SITE(), ss.domain.PROJECTS, ss.operation.EDIT_OTHER);
		$scope.rights.showControlBar = $scope.rights.deleteOther || $scope.rights.create || $scope.rights.editOther;
		
		// Breadcrumb
		breadcrumbService.set('top',
				[
				 {href: '/app/sfchecks#/projects', label: 'My Projects'},
				 {href: '/app/sfchecks#/project/' + $routeParams.projectId, label: ''},
				]
		);
		
		// Broadcast Messages
		// items are in the format of {id: id, message: message}
		$scope.messages = [];
		
		/*
		function addMessage(id, message) {
			messages.push({id: id, message: message});
		};
		*/
		
		$scope.markMessageRead = function(id) {
			for (index in $scope.messages) {
				m = $scope.messages[index];
				if (m.id == id) {
					$scope.messages.splice(index, 1);
					projectService.markMessageRead(projectId, id);
					break;
				}
			}
		};
		
		
		
		// Listview Selection
		$scope.newTextCollapsed = true;
		$scope.selected = [];
		$scope.updateSelection = function(event, item) {
			var selectedIndex = $scope.selected.indexOf(item);
			var checkbox = event.target;
			if (checkbox.checked && selectedIndex == -1) {
				$scope.selected.push(item);
			} else if (!checkbox.checked && selectedIndex != -1) {
				$scope.selected.splice(selectedIndex, 1);
			}
		};
		$scope.isSelected = function(item) {
			return item != null && $scope.selected.indexOf(item) >= 0;
		};
		
		$scope.texts = [];
		
		// Page Dto
		$scope.getPageDto = function() {
			projectService.pageDto(projectId, function(result) {
				if (result.ok) {
					$scope.texts = result.data.texts;
					$scope.textsCount = $scope.texts.length;
					$scope.enhanceDto($scope.texts);
					
					$scope.messages = result.data.broadcastMessages;
					
					// update activity count service
					$scope.activityUnreadCount = result.data.activityUnreadCount;
					
					$scope.members = result.data.members;
						

					$scope.project = result.data.project;
					$scope.project.url = linkService.project(projectId);
					
					breadcrumbService.updateCrumb('top', 1, {label: $scope.project.name});

					var rights = result.data.rights;
					$scope.rights.deleteOther = ss.hasRight(rights, ss.domain.TEXTS, ss.operation.DELETE_OTHER); 
					$scope.rights.create = ss.hasRight(rights, ss.domain.TEXTS, ss.operation.CREATE); 
					$scope.rights.editOther = ss.hasRight(rights, ss.domain.TEXTS, ss.operation.EDIT_OTHER);
					$scope.rights.showControlBar = $scope.rights.deleteOther || $scope.rights.create || $scope.rights.editOther;
				}
			});
		};
		
		// Remove Text
		$scope.removeTexts = function() {
			console.log("removeTexts()");
			var textIds = [];
			for(var i = 0, l = $scope.selected.length; i < l; i++) {
				textIds.push($scope.selected[i].id);
			}
			if (l == 0) {
				return;
			}
			textService.remove(projectId, textIds, function(result) {
				if (result.ok) {
					if (textIds.length == 1) {
						notice.push(notice.SUCCESS, "The text was removed successfully");
					} else {
						notice.push(notice.SUCCESS, "The texts were removed successfully");
					}
					$scope.selected = []; // Reset the selection
					$scope.queryTexts();
					// TODO
				}
			});
		};
		// Add
		$scope.addText = function() {
			console.log("addText()");
			var model = {};
			model.id = '';
			model.title = $scope.title;
			model.content = $scope.content;
			textService.update(projectId, model, function(result) {
				if (result.ok) {
					notice.push(notice.SUCCESS, "The text '" + model.title + "' was added successfully")
					$scope.queryTexts();
				}
			});
		};

		$scope.getQuestionCount = function(text) {
			return text.questionCount;
		};

		$scope.getResponses = function(text) {
			return "'Not Yet Implemented'";
		};
		
		$scope.enhanceDto = function(items) {
			for (var i in items) {
				items[i].url = linkService.text($scope.projectId, items[i].id);
			}
		};
		
		$scope.getPageDto();

	}])
	.controller('ProjectSettingsCtrl', ['$scope', '$location', '$routeParams', 'breadcrumbService', 'userService', 'projectService', 'sessionService', 'silNoticeService',
	                                 function($scope, $location, $routeParams, breadcrumbService, userService, projectService, ss, notice) {
		var projectId = $routeParams.projectId;
		$scope.project = {};
		$scope.settings = {
			'sms': {},
			'email': {}
		};
		$scope.project.id = projectId;

		// Breadcrumb
		breadcrumbService.set('top',
				[
				 {href: '/app/sfchecks#/projects', label: 'My Projects'},
				 {href: '/app/sfchecks#/project/' + $routeParams.projectId, label: ''},
				 {href: '/app/sfchecks#/project/' + $routeParams.projectId + '/settings', label: 'Settings'},
				]
		);

		$scope.updateProject = function() {
			var newProject = {
				id: $scope.project.id,
				projectname: $scope.project.name,
				featured: $scope.project.featured
			};
			projectService.update(newProject, function(result) {
				if (result.ok) {
					notice.push(notice.SUCCESS, $scope.project.name + " settings updated successfully");
				}
			});
		};
		
		$scope.updateCommunicationSettings = function() {
			projectService.updateSettings($scope.project.id, $scope.settings.sms, $scope.settings.email, function(result) {
				if (result.ok) {
					notice.push(notice.SUCCESS, $scope.project.name + " SMS settings updated successfully");
				}
			});
		};
		
		$scope.readCommunicationSettings = function() {
			projectService.readSettings($scope.project.id, function(result) {
				if (result.ok) {
					$scope.settings.sms = result.data.sms;
					$scope.settings.email = result.data.email;
				}
			});
		}
		
		$scope.canEditCommunicationSettings = function() {
			return ss.hasRight(ss.realm.SITE(), ss.domain.PROJECTS, ss.operation.EDIT_OTHER);
		}
		
	
		// ----------------------------------------------------------
		// List
		// ----------------------------------------------------------
		$scope.selected = [];
		$scope.updateSelection = function(event, item) {
			var selectedIndex = $scope.selected.indexOf(item);
			var checkbox = event.target;
			if (checkbox.checked && selectedIndex == -1) {
				$scope.selected.push(item);
			} else if (!checkbox.checked && selectedIndex != -1) {
				$scope.selected.splice(selectedIndex, 1);
			}
		};
		$scope.isSelected = function(item) {
			return item != null && $scope.selected.indexOf(item) >= 0;
		};
		
		$scope.users = [];
		$scope.queryProjectUsers = function() {
			projectService.listUsers($scope.project.id, function(result) {
				if (result.ok) {
					$scope.project.name = result.data.projectName;
					$scope.project.featured = result.data.projectIsFeatured;
					$scope.project.users = result.data.entries;
					$scope.project.userCount = result.data.count;
					// Rights
					var rights = result.data.rights;
					$scope.rights = {};
					$scope.rights.deleteOther = ss.hasRight(rights, ss.domain.USERS, ss.operation.DELETE_OTHER); 
					$scope.rights.create = ss.hasRight(rights, ss.domain.USERS, ss.operation.CREATE); 
					$scope.rights.editOther = ss.hasRight(rights, ss.domain.USERS, ss.operation.EDIT_OTHER);
					$scope.rights.showControlBar = $scope.rights.deleteOther || $scope.rights.create || $scope.rights.editOther;
					// Breadcrumb
					breadcrumbService.updateCrumb('top', 1, {label: result.data.bcs.project.crumb});
					
				}
			});
		};
		
		$scope.removeProjectUsers = function() {
			console.log("removeUsers");
			var userIds = [];
			for(var i = 0, l = $scope.selected.length; i < l; i++) {
				userIds.push($scope.selected[i].id);
			}
			if (l == 0) {
				// TODO ERROR
				return;
			}
			projectService.removeUsers($scope.project.id, userIds, function(result) {
				if (result.ok) {
					$scope.queryProjectUsers();
					$scope.selected = [];
					if (userIds.length == 1) {
						notice.push(notice.SUCCESS, "The user was removed from this project");
					} else {
						notice.push(notice.SUCCESS, userIds.length + " users were removed from this project");
					}
				}
			});
		};
		
		// Roles in list
		$scope.roles = [
	        {key: 'user', name: 'Member'},
	        {key: 'project_admin', name: 'Manager'}
        ];
		
		$scope.onRoleChange = function(user) {
			var model = {};
			model.id = user.id;
			model.role = user.role;
			console.log('userchange...', model);
			projectService.updateUser($scope.project.id, model, function(result) {
				if (result.ok) {
					notice.push(notice.SUCCESS, user.username + "'s role was changed to " + user.role);
				}
			});
		};
		
		// ----------------------------------------------------------
		// Typeahead
		// ----------------------------------------------------------
	    $scope.users = [];
	    $scope.addModes = {
	    	'addNew': { 'en': 'Create New User', 'icon': 'icon-user'},
	    	'addExisting' : { 'en': 'Add Existing User', 'icon': 'icon-user'},
	    	'invite': { 'en': 'Send Email Invite', 'icon': 'icon-envelope'}
	    };
	    $scope.addMode = 'addNew';
	    $scope.typeahead = {};
	    $scope.typeahead.userName = '';
		
		$scope.queryUser = function(userName) {
			console.log('searching for ', userName);
			userService.typeahead(userName, function(result) {
				// TODO Check userName == controller view value (cf bootstrap typeahead) else abandon.
				if (result.ok) {
					$scope.users = result.data.entries;
					$scope.updateAddMode();
				}
			});
		};
		$scope.addModeText = function(addMode) {
			return $scope.addModes[addMode].en;
		};
		$scope.addModeIcon = function(addMode) {
			return $scope.addModes[addMode].icon;
		};
		$scope.updateAddMode = function(newMode) {
			if (newMode in $scope.addModes) {
				$scope.addMode = newMode;
			} else {
				// This also covers the case where newMode is undefined
				$scope.calculateAddMode();
			}
		}
		$scope.calculateAddMode = function() {
			// TODO This isn't adequate.  Need to watch the 'typeahead.userName' and 'selection' also. CP 2013-07
			if ($scope.typeahead.userName.indexOf('@') != -1) {
				$scope.addMode = 'invite';
			} else if ($scope.users.length == 0) {
				$scope.addMode = 'addNew';
			} else if (!$scope.typeahead.userName) {
				$scope.addMode = 'addNew';
			} else {
				$scope.addMode = 'addExisting';
			}
		};
		
		$scope.addProjectUser = function() {
			var model = {};
			if ($scope.addMode == 'addNew') {
				model.name = $scope.typeahead.userName;
			} else if ($scope.addMode == 'addExisting') {
				model.id = $scope.user.id;
			} else if ($scope.addMode == 'invite') {
				model.email = $scope.typeahead.userName;
			}
			projectService.updateUser($scope.project.id, model, function(result) {
				if (result.ok) {
					if ($scope.addMode == "addNew") {
						notice.push(notice.SUCCESS, "User '" + model.name + "' was created and added to " + $scope.project.name);
					} else if ($scope.addMode == "addExisting") {
						notice.push(notice.SUCCESS, "'" + $scope.user.name + "' was added to " + $scope.project.name + " successfully");
					} else {
						notice.push(notice.SUCCESS, "'" + model.email + "' was invited to join the project " + $scope.project.name);
					}
					$scope.queryProjectUsers();
				}
			});
		};
	
		$scope.selectUser = function(item) {
			console.log('user selected', item);
			$scope.user = item;
			$scope.typeahead.userName = item.name;
			$scope.updateAddMode('addExisting');
		};
	
		$scope.imageSource = function(avatarRef) {
			return avatarRef ? '/images/avatar/' + avatarRef : '/images/avatar/anonymous02.png';
		};
	
	}])
	;
