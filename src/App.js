import './App.css';
import React from 'react';
import SignInButton from './SignInButton';
import PlaylistAdd from './PlaylistAdd';
import TrackList from './TrackList';
import Cookies from './cookies'; 
import Step from './Step';
import LoadingButton from '@mui/lab/LoadingButton';
import { Alert, Button, Link, Snackbar } from '@mui/material';

const request = async (url, method = 'GET', body = '') => {
  return await fetch('/request', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-type': 'application/json'
    },
    body: JSON.stringify({
      url: url.toString(),
      method: method,
      body: body
    })
  });
}

const hasValidToken = (service) => {
  const tokenKey = `${service}_token`;
  const token = Cookies.get(tokenKey);
  if (!token) {
    return false;
  }

  const tokenExpiration = new Date(token.expires_at);
  if (tokenExpiration < new Date()) {
    return false;
  }

  return true;
}


export default class App extends React.Component {
  state = {
    stepBeforeError: null,
    tracks: {}, 
    step: 'start', 
    trackListError: false, 
    bookmarksButtonLoading: false, 
    snackbarOpen: false,
    validSpotifyToken: hasValidToken('spotify'),
    validTwitterToken: hasValidToken('twitter'),
  };
  
  didReceiveTracks(tracks) {
    this.setState({tracks});
  }

  didReceiveBookmarkableTweets(tweets) {
    this.setState({bookmarkableTweets: tweets});
  }

  async stepToTrackSelection() {
    try {
      const myUser = await request('https://api.twitter.com/2/users/me');
      const myUserResponse = await myUser.json();
      const { id } = myUserResponse.response.data;
  
      const myBookmarksURL = new URL(`https://api.twitter.com/2/users/${id}/bookmarks`);
      myBookmarksURL.searchParams.append('tweet.fields', 'entities');
      myBookmarksURL.searchParams.append('expansions', 'author_id');
      myBookmarksURL.searchParams.append('user.fields', 'verified');
  
      const myBookmarks = await request(myBookmarksURL);
      const myBookmarksResponse = await myBookmarks.json();
  
      const spotifyUrlLookup = (urls) => urls?.find(url => typeof url?.unwound_url !== 'undefined' && url.unwound_url.startsWith('https://open.spotify.com/track'));
      
      if (myBookmarksResponse.response.data.find(tweet => spotifyUrlLookup(tweet.entities?.urls))) {
        this.setState({step: 'addTracksFromBookmarks', bookmarkableTweets: myBookmarksResponse.response});
      } else {
        this.setState({step: 'addTracksFromSearch'});
      }  
    } catch (e) {
      console.error(e);
      this.setState({stepBeforeError: this.state.step, step: 'error'});
    }
  }

  async addTweetsToBookmarks() {
    this.setState({bookmarksButtonLoading: true});
    try {
      const myUser = await request('https://api.twitter.com/2/users/me');
      const myUserResponse = await myUser.json();
      const { id } = myUserResponse.response.data;
      this.state.bookmarkableTweets.data.map(async (tweet) => {
        const bookmarksAdd = await request(`https://api.twitter.com/2/users/${id}/bookmarks`, 'POST', {
          tweet_id: tweet.id
        });  
      });

      this.setState({bookmarksButtonLoading: false, snackbarOpen: true, step: 'addTracksFromBookmarks'});
    } catch (e) {
      console.error(e);
      this.setState({bookmarksButtonLoading: false, trackListError: true});
    }
  }

  async componentDidMount() {
    if (this.state.step === 'start') {
      const url = new URL(window.location.href);
      const service = url.searchParams.get('service');
      const success = url.searchParams.get('success');

      if (success || service) {
        window.history.pushState({}, '', '/');
      }

      if (success === '1') {
        switch (service) {
          case 'spotify':
            if (this.state.validTwitterToken) {
              return await this.stepToTrackSelection();
            } else {
              return await this.setState({step: 'twitter'});
            }

          case 'twitter':
            return await this.stepToTrackSelection();
        }
      } else if (success === '0') {
        switch (service) {
          case 'spotify':
            return this.setState({step: 'spotify'});
          case 'twitter':
            return this.setState({step: 'twitter'});
        }
      }
    }
  }

  async stepPastIntro() {
    if (!this.state.validSpotifyToken) {
      return this.setState({step: 'spotify'});
    } else if (!this.state.validTwitterToken) {
      return this.setState({step: 'twitter'});
    } else {
      return await this.stepToTrackSelection();
    }
  }

  render() {
    return <>
      <Step step="start" currentStep={this.state.step}>
        <h1>People on Twitter bookmark millions of Spotify tracks.</h1>
        <h1>My Twitter Jam helps you create a playlist from your Twitter Bookmarks.</h1>
        <Button variant='contained' size='large' onClick={() => this.stepPastIntro()}>Get started</Button>
        <div style={{marginTop: 5 + 'rem'}}>
          <p>Made with ???? by the <Link target='_blank' href="https://twitter.com/TwitterDev">@TwitterDev</Link> team.</p>
          <p>Check out the <Link target='_blank' href="https://github.com/twitterdev/mytwitterjam">Source code on Github</Link> or <Link target='_blank' href="https://glitch.com/edit/#!/remix/mytwitterjam">Remix this app</Link></p>
        </div>
      </Step>
      <Step step="spotify" currentStep={this.state.step}>
        <h1>Authorize Spotify so I can get track info and create a playlists.</h1>
        <h3>You will create a playlist, but only if you want to.</h3>
        <SignInButton onSuccess={() => this.setState({step: 'twitter'})} href={`${process.env.REACT_APP_BACKEND_URL ?? ''}/authorize/spotify`} service="spotify">Authorize Spotify</SignInButton>
      </Step>
      <Step step="twitter" currentStep={this.state.step}>
        <h1>Authorize Twitter so can I check if there is music in your Bookmarks.</h1>
        <h3>This app will never Tweet on your behalf. It will only search for music and create Bookmarks, but only with your explicit consent.</h3>
        <SignInButton onSuccess={() => this.stepToTrackSelection()} href={`${process.env.REACT_APP_BACKEND_URL ?? ''}/authorize/twitter`} service="twitter">Authorize Twitter</SignInButton>
      </Step>
      <Step step="addTracksFromSearch" currentStep={this.state.step}>
        { this.state.trackListError ? <></> : <>
        <h1>Looks like you don't have Spotify tracks in your Bookmarks.</h1>
        <h1>Don't worry, let's add some. Here's some suggestions:</h1>
        </>}
        <TrackList onError={() => this.setState({trackListError: true})} onTweetsReceive={(tweets) => this.didReceiveBookmarkableTweets(tweets)}></TrackList>
        <LoadingButton loading={this.state.bookmarksButtonLoading} onClick={() => this.addTweetsToBookmarks()} variant='contained'>{this.state.trackListError ? 'Retry' : 'Add to your Twitter Bookmarks'}</LoadingButton>
        <Snackbar open={this.state.snackbarOpen} autoHideDuration={5000} onClose={() => this.setState({snackbarOpen: false})}><Alert severity="success" sx={{width: '100%'}}>Nice! These songs are now in your Twitter Bookmarks.</Alert></Snackbar>
      </Step>
      <Step step="addTracksFromBookmarks" currentStep={this.state.step}>
        <h1>I found some good tracks in your Bookmarks.</h1>
        <h1>Add them to a Spotify playlist.</h1>
        <TrackList onTracksReceive={(tracks) => this.didReceiveTracks(tracks)} tweets={this.state.bookmarkableTweets}></TrackList>
        {this.state.tracks ? <PlaylistAdd onComplete={(playlist) => this.setState({step: 'end', playlist: playlist})} tracks={this.state.tracks}></PlaylistAdd> : <></>}
      </Step>
      <Step step="end" currentStep={this.state.step}>
        <h1>Success! You created your Twitter Jam.</h1>
        <h1><Link href={this.state.playlist?.external_urls.spotify} underline="hover">Check it out.</Link></h1>
        <div style={{marginTop: 5 + 'rem'}}>
          <h2>Want to create your own app like this?</h2>
          <h2><Link underline="hover" href='https://t.co/signup'>Sign up for the Twitter API</Link> (it's free!) and <Link underline="hover" href='https://github.com/twitterdev/mytwitterjam'>clone this project.</Link></h2>
        </div>
      </Step>
      <Step step="error" currentStep={this.state.step}>
        <h1>Mic drop. ????????</h1>
        <h2>Something went wrong while talking to the internet.</h2>
        <Button variant='outlined' onClick={() => this.setState({step: this.state.stepBeforeError, stepBeforeError: null})}>Retry</Button>
      </Step>
      </>;
  }
}