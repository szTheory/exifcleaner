package File::HomeDir::FreeDesktop;

# Specific functionality for unixes running free desktops
# compatible with (but not using) File-BaseDir-0.03

# See POD at the end of the file for more documentation.

use 5.008003;
use strict;
use warnings;
use Carp                ();
use File::Spec          ();
use File::Which         ();
use File::HomeDir::Unix ();

use vars qw{$VERSION};
use base "File::HomeDir::Unix";

BEGIN
{
    $VERSION = '1.006';
}

# xdg uses $ENV{XDG_CONFIG_HOME}/user-dirs.dirs to know where are the
# various "my xxx" directories. That is a shell file. The official API
# is the xdg-user-dir executable. It has no provision for assessing
# the directories of a user that is different than the one we are
# running under; the standard substitute user mechanisms are needed to
# overcome this.

my $xdgprog = File::Which::which('xdg-user-dir');

sub _my
{
    # No quoting because input is hard-coded and only comes from this module
    my $thingy = qx($xdgprog $_[1]);
    chomp $thingy;
    return $thingy;
}

# Simple stuff
sub my_desktop   { shift->_my('DESKTOP') }
sub my_documents { shift->_my('DOCUMENTS') }
sub my_music     { shift->_my('MUSIC') }
sub my_pictures  { shift->_my('PICTURES') }
sub my_videos    { shift->_my('VIDEOS') }

sub my_data
{
    $ENV{XDG_DATA_HOME}
      or File::Spec->catdir(shift->my_home, qw{ .local share });
}

sub my_config
{
    $ENV{XDG_CONFIG_HOME}
      or File::Spec->catdir(shift->my_home, qw{ .config });
}

# Custom locations (currently undocumented)
sub my_download    { shift->_my('DOWNLOAD') }
sub my_publicshare { shift->_my('PUBLICSHARE') }
sub my_templates   { shift->_my('TEMPLATES') }

sub my_cache
{
    $ENV{XDG_CACHE_HOME}
      || File::Spec->catdir(shift->my_home, qw{ .cache });
}

#####################################################################
# General User Methods

sub users_desktop   { Carp::croak('The users_desktop method is not available on an XDG based system.'); }
sub users_documents { Carp::croak('The users_documents method is not available on an XDG based system.'); }
sub users_music     { Carp::croak('The users_music method is not available on an XDG based system.'); }
sub users_pictures  { Carp::croak('The users_pictures method is not available on an XDG based system.'); }
sub users_videos    { Carp::croak('The users_videos method is not available on an XDG based system.'); }
sub users_data      { Carp::croak('The users_data method is not available on an XDG based system.'); }

1;

=pod

=head1 NAME

File::HomeDir::FreeDesktop - Find your home and other directories on FreeDesktop.org Unix

=head1 DESCRIPTION

This module provides implementations for determining common user
directories.  In normal usage this module will always be
used via L<File::HomeDir>.

This module can operate only when the command C<xdg-user-dir> is available
and executable, which is typically achieved by installed a package named
C<xdg-user-dirs> or similar.

One can find the latest spec at L<https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html>.

=head1 SYNOPSIS

  use File::HomeDir;
  
  # Find directories for the current user
  $home     = File::HomeDir->my_home;        # /home/mylogin
  $desktop  = File::HomeDir->my_desktop;
  $docs     = File::HomeDir->my_documents;
  $music    = File::HomeDir->my_music;
  $pics     = File::HomeDir->my_pictures;
  $videos   = File::HomeDir->my_videos;
  $data     = File::HomeDir->my_data;
  $config   = File::HomeDir->my_config;
  
  # Some undocumented ones, expect they don't work - use with caution
  $download    = File::HomeDir->my_download;
  $publicshare = File::HomeDir->my_publicshare;
  $templates   = File::HomeDir->my_templates;
  $cache       = File::HomeDir->my_cache;

=head1 AUTHORS

Jerome Quelin E<lt>jquellin@cpan.org<gt>

Adam Kennedy E<lt>adamk@cpan.orgE<gt>

=head1 SEE ALSO

L<File::HomeDir>, L<File::HomeDir::Win32> (legacy)

=head1 COPYRIGHT

Copyright 2009 - 2011 Jerome Quelin.

Some parts copyright 2010 Adam Kennedy.

Some parts copyright 2017 - 2020 Jens Rehsack

This program is free software; you can redistribute
it and/or modify it under the same terms as Perl itself.

The full text of the license can be found in the
LICENSE file included with this module.

=cut
