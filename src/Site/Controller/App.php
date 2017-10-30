<?php

namespace Site\Controller;

use Api\Library\Shared\SilexSessionHelper;
use Api\Library\Shared\Website;
use Silex\Application;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

class App extends Base
{
    public function view(
        /** @noinspection PhpUnusedParameterInspection */
        Request $request, Application $app, $appName, $projectId = ''
    ) {
        $this->setupBaseVariables($app);
        $this->setupAngularAppVariables($app, $appName, $projectId);
        return $this->renderPage($app, 'angular-app');
    }

    public function oauthCallback(Request $request, Application $app)
    {
        $provider = new \League\OAuth2\Client\Provider\Google([
            'clientId'     => GOOGLE_CLIENT_ID,
            'clientSecret' => GOOGLE_CLIENT_SECRET,
            'redirectUri'  => 'https://localdev.scriptureforge.org/oauthcallback',
            'hostedDomain' => 'https://localdev.scriptureforge.org',
        ]);

        $error = $request->query->get('error', null);
        if (! is_null($error)) {
            return new Response('OAuth error ' . htmlspecialchars($error, ENT_QUOTES, 'UTF-8'), 200);
        }
        if ($app['session']->has('oauthtoken')) {
            $token = $app['session']->get('oauthtoken');
        } else {
            $code = $request->query->get('code', null);
            if (is_null($code)) {   //
                $authUrl = $provider->getAuthorizationUrl();
                $app['session']->set('oauth2state', $provider->getState());
                $_SESSION['oauth2state'] = $provider->getState();  // TODO: Determine how these should be stored under Silex: probably not in $_SESSION
                return new RedirectResponse($authUrl);
            } else {
                $state = $request->query->get('state', null);
                if (is_null($state) || ($state !== $app['session']->get('oauth2state'))) {
                    // Invalid state, which *could* indicate some kind of attempted hack (CSRF, etc.)
                    $app['session']->remove('oauth2state');
                    return new Response('DEBUG: Invalid OAuth state', 200);  // TODO: determine how to handle this scenario
                }
                if ($app['session']->has('oauthtoken')) {
                    $token = $app['session']->get('oauthtoken');
                } else {
                    $token = $provider->getAccessToken('authorization_code', [
                        'code' => $code
                    ]);
                    $app['session']->set('oauthtoken', $token);  // TODO: Decide how to store which provider the token is from (Google or Paratext, maybe Facebook in the future)
                }
            }
        }
        try {
            $userDetails = $provider->getResourceOwner($token);
            return new Response('Hello, ' . $userDetails->getName() . '. Your email is ' . $userDetails->getEmail() . ' and your avatar is <img src="' . $userDetails->getAvatar() . '"/><br/>The token was ' . $token->getToken() . 'and the user ID was ' . $userDetails->getId(), 200);
        } catch (Exception $e) {
            return new Response('DEBUG: Failure getting user details', 200);  // TODO: determine how to handle this scenario
        }
    }

    public function setupAngularAppVariables(Application $app, $appName, $projectId = '')
    {
        /**
         * authentication is handled by the security policy set in index.php
         *
         * both /app/[appName] and /public/[appName] are handled by this controller
         * /public/[appName] does not require authentication whereas /app/[appName] requires a user to be logged in
         *
         */

        if ($projectId == 'favicon.ico') {
            $projectId = '';
        }

        $isPublicApp = (preg_match('@^/(public|auth)/@', $app['request']->getRequestUri()) == 1);

        $appModel = new AppModel($appName, $projectId, $this->website, $isPublicApp);

        if ($appModel->isChildApp) {
            $appName = "$appName-$projectId";
            $projectId = '';
        }

        $this->_appName = $appName;
        $this->data['isAngular2'] = $appModel->isAppAngular2();
        $this->data['isBootstrap4'] = $appModel->isBootstrap4;
        $this->data['appName'] = $appName;
        $this->data['appFolder'] = $appModel->appFolder;
        $this->data['bootstrapFolder'] = $appModel->bootstrapFolder;

        if ($appModel->requireProject) {
            if ($isPublicApp) {
                $projectId = SilexSessionHelper::requireValidProjectIdForThisWebsite($app, $this->website, $projectId);
            } else {
                $projectId = SilexSessionHelper::requireValidProjectIdForThisWebsiteAndValidateUserMembership($app, $this->website, $projectId);
            }
        }

        $app['session']->set('projectId', $projectId);
        $this->_projectId = $projectId;

        // determine help menu button visibility
        // placeholder for UI language 'en' to support translation of helps in the future
        $helpsFolder = $appModel->appFolder . "/helps/en/page";
        if (file_exists($helpsFolder) &&
            iterator_count(new \FilesystemIterator($helpsFolder, \FilesystemIterator::SKIP_DOTS)) > 0
        ) {
            $this->_showHelp = true;
        }

        $this->addJavascriptFiles($appModel->siteFolder . '/js', array('vendor', 'assets'));

        if ($this->data['isAngular2']) {
            $this->addJavascriptFiles($appModel->appFolder . '/dist');
        } else {
            $this->addJavascriptFiles($appModel->appFolder, array('js/vendor', 'js/assets'));
        }

        if ($appModel->parentAppFolder) {
            $this->addJavascriptFiles($appModel->parentAppFolder, array('js/vendor', 'js/assets'));
        }

        if ($appName == 'semdomtrans' || $appName == 'semdomtrans-new-project') {
            // special case for semdomtrans app
            // add lexicon JS files since the semdomtrans app depends upon these JS files
            $this->addJavascriptFiles($appModel->siteFolder . '/lexicon', array('js/vendor', 'js/assets'));
        }

        if ($appModel->isBootstrap4) {
            $this->addCssFiles(NG_BASE_FOLDER . 'bellows/cssBootstrap4');
            $this->addCssFiles(NG_BASE_FOLDER . 'bellows/directive/bootstrap4');
        } else {
            $this->addCssFiles(NG_BASE_FOLDER . 'bellows/cssBootstrap2');
            $this->addCssFiles(NG_BASE_FOLDER . 'bellows/directive/bootstrap2');
        }
        $this->addCssFiles($appModel->bootstrapFolder, array('node_modules'));
    }
}

class AppNotFoundException extends \Exception { }

class AppModel {

    /**
     * @var string
     */
    public $appName;

    /**
     * @var string
     */
    public $parentAppFolder;

    /**
     * @var string
     */
    public $appFolder;

    /**
     * @var bool
     */
    public $isBellows;

    /**
     * @var bool
     */
    public $isChildApp;

    /**
     * @var string
     */
    public $siteFolder;

    /**
     * @var string
     */
    public $bootstrapFolder;

    /**
     * @var bool
     */
    public $isBootstrap4;

    /**
     * @var string
     */
    public $bellowsFolder;

    /**
     * @var bool
     */
    public $requireProject;

    /**
     * AppModel constructor
     * @param $appName string
     * @param $projectId string
     * @param $website Website
     * @param $isPublicApp bool
     */
    public function __construct($appName, $projectId, $website, $isPublicApp)
    {
        $this->appName = $appName;
        $this->determineFolderPaths($appName, $projectId, $website, $isPublicApp);
    }

    private function determineFolderPaths($appName, $projectId, $website, $isPublic) {
        $isBootstrap4 = $this->isAppBootstrap4($appName, $website);
        $siteFolder = NG_BASE_FOLDER . $website->base;
        $sitePublicFolder = "$siteFolder/public";
        $bellowsFolder = NG_BASE_FOLDER . "bellows";
        $bellowsAppFolder = "$bellowsFolder/apps";
        $bellowsPublicAppFolder = "$bellowsAppFolder/public";
        $parentAppFolder = '';
        $isChildApp = false;
        $isBellows = false;

        if ($isPublic) {
            if ($this->isChildApp($sitePublicFolder, $appName, $projectId)) {
                $parentAppFolder = "$sitePublicFolder/$appName";
                $appFolder = "$parentAppFolder/$projectId";
                $isChildApp = true;
                $appName = "$appName-$projectId";
            } elseif ($this->isChildApp($bellowsPublicAppFolder, $appName, $projectId)) {
                $parentAppFolder = "$bellowsPublicAppFolder/$appName";
                $appFolder = "$parentAppFolder/$projectId";
                $isChildApp = true;
                $appName = "$appName-$projectId";
                $isBellows = true;
            } elseif ($this->appExists($sitePublicFolder, $appName)) {
                $appFolder = "$sitePublicFolder/$appName";
            } elseif ($this->appExists($bellowsPublicAppFolder, $appName)) {
                $appFolder = "$bellowsPublicAppFolder/$appName";
                $isBellows = true;
            } else {
                throw new AppNotFoundException();
            }
        } else {
            if ($this->isChildApp($siteFolder, $appName, $projectId)) {
                $parentAppFolder = "$siteFolder/$appName";
                $appFolder = "$parentAppFolder/$projectId";
                $isChildApp = true;
                $appName = "$appName-$projectId";
            } elseif ($this->isChildApp($bellowsAppFolder, $appName, $projectId)) {
                $parentAppFolder = "$bellowsAppFolder/$appName";
                $appFolder = "$parentAppFolder/$projectId";
                $appName = "$appName-$projectId";
                $isChildApp = true;
                $isBellows = true;
            } elseif ($this->appExists($siteFolder, $appName)) {
                $appFolder = "$siteFolder/$appName";
            } elseif ($this->appExists($bellowsAppFolder, $appName)) {
                $appFolder = "$bellowsAppFolder/$appName";
                $isBellows = true;
            } else {
                throw new AppNotFoundException();
            }
        }

        $bootstrapNumber = ($isBootstrap4) ? 4 : 2;
        if (file_exists("$appFolder/bootstrap$bootstrapNumber")) {
            $bootstrapFolder = "$appFolder/bootstrap$bootstrapNumber";
        } else {
            $bootstrapFolder = $appFolder;
        }

        $this->siteFolder = $siteFolder;
        $this->appFolder = $appFolder;
        $this->parentAppFolder = $parentAppFolder;
        $this->bootstrapFolder = $bootstrapFolder;
        $this->isBootstrap4 = $isBootstrap4;
        $this->isChildApp = $isChildApp;
        $this->isBellows = $isBellows;
        $this->bellowsFolder = $bellowsFolder;
        $this->requireProject = $this->isProjectContextRequired($appName);
    }

    private function isProjectContextRequired($appName) {
        switch ($appName) {
            case "sfchecks":
            case "lexicon":
            case "semdomtrans":
            case "projectmanagement":
            case "usermanagement":
                return true;
            default:
                return false;
        }
    }

    public function isAppAngular2() {
        $siteAppsInAngular2 = array(
            "rapid-words",
            "review-suggest"
        );
        return in_array($this->appName, $siteAppsInAngular2);
    }

    private function isAppBootstrap4($appName, $website) {

        // replace "appName" with the name of the angular app that has been migrated to bootstrap 4
        // Note that this will affect both the angular app and the app frame

        $sharedAppsInBoostrap4 = array(
            "activity",
            "changepassword",
            "forgot_password",
            "login",
            "projects",
            "reset_password",
            "signup",
            "siteadmin",
            "usermanagement",
            "userprofile"
        );

        $siteAppsInBootstrap4 = array(
            "scriptureforge" => array("sfchecks"),
            "languageforge" => array(
                "rapid-words",
                "lexicon"
            ),
            "waaqwiinaagiwritings" => array("sfchecks"),
            "jamaicanpsalms.scriptureforge" => array("sfchecks"),
            "demo.scriptureforge" => array("sfchecks"),
        );

        $siteLookup = preg_replace('/^(dev|e2etest|qa)?(\.)?(\S+)\.(org|local|com)$/', '$3', $website->domain);

        if (in_array($appName, $sharedAppsInBoostrap4)) {
            return true;
        }

        if (array_key_exists($siteLookup, $siteAppsInBootstrap4)) {
            if (in_array($appName, $siteAppsInBootstrap4[$siteLookup])) {
                return true;
            }
        }

        return false;
    }

    private function isChildApp($location, $parentAppName, $appName) {
        $appFolder = "$location/$parentAppName/$appName";
        return (
            $appName != '' &&
            file_exists($appFolder) &&
            file_exists("$appFolder/views")
        );
    }

    private function appExists($location, $appName) {
        $appFolder = "$location/$appName";
        return file_exists($appFolder);
    }
}
