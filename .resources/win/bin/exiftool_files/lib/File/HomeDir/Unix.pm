package File::HomeDir::Unix;

# See POD at the end of the file for documentation

use 5.008003;
use strict;
use warnings;
use Carp                  ();
use File::HomeDir::Driver ();

use vars qw{$VERSION};
use base "File::HomeDir::Driver";

BEGIN
{
    $VERSION = '1.006';
}

#####################################################################
# Current User Methods

sub my_home
{
    my $class = shift;
    my $home  = $class->_guess_home(@_);

    # On Unix in general, a non-existent home means "no home"
    # For example, "nobody"-like users might use /nonexistent
    if (defined $home and not -d $home)
    {
        $home = undef;
    }

    return $home;
}

sub _guess_env_home
{
    my $class = shift;
    if (exists $ENV{HOME} and defined $ENV{HOME} and length $ENV{HOME})
    {
        return $ENV{HOME};
    }

    # This is from the original code, but I'm guessing
    # it means "login directory" and exists on some Unixes.
    if (exists $ENV{LOGDIR} and $ENV{LOGDIR})
    {
        return $ENV{LOGDIR};
    }

    return;
}

sub _guess_determined_home
{
    my $class = shift;

    # Light desperation on any (Unixish) platform
  SCOPE:
    {
        my $home = (getpwuid($<))[7];
        return $home if $home and -d $home;
    }

    return;
}

sub _guess_home
{
    my $class = shift;
    my $home  = $class->_guess_env_home($@);
    $home ||= $class->_guess_determined_home($@);
    return $home;
}

# On unix by default, everything is under the same folder
sub my_desktop
{
    shift->my_home;
}

sub my_documents
{
    shift->my_home;
}

sub my_data
{
    shift->my_home;
}

sub my_music
{
    shift->my_home;
}

sub my_pictures
{
    shift->my_home;
}

sub my_videos
{
    shift->my_home;
}

#####################################################################
# General User Methods

sub users_home
{
    my ($class, $name) = @_;

    # IF and only if we have getpwuid support, and the
    # name of the user is our own, shortcut to my_home.
    # This is needed to handle HOME environment settings.
    if ($name eq getpwuid($<))
    {
        return $class->my_home;
    }

  SCOPE:
    {
        my $home = (getpwnam($name))[7];
        return $home if $home and -d $home;
    }

    return undef;
}

sub users_desktop
{
    shift->users_home(@_);
}

sub users_documents
{
    shift->users_home(@_);
}

sub users_data
{
    shift->users_home(@_);
}

sub users_music
{
    shift->users_home(@_);
}

sub users_pictures
{
    shift->users_home(@_);
}

sub users_videos
{
    shift->users_home(@_);
}

1;

=pod

=head1 NAME

File::HomeDir::Unix - Find your home and other directories on legacy Unix

=head1 SYNOPSIS

  use File::HomeDir;
  
  # Find directories for the current user
  $home    = File::HomeDir->my_home;        # /home/mylogin
  $desktop = File::HomeDir->my_desktop;     # All of these will... 
  $docs    = File::HomeDir->my_documents;   # ...default to home...
  $music   = File::HomeDir->my_music;       # ...directory
  $pics    = File::HomeDir->my_pictures;    #
  $videos  = File::HomeDir->my_videos;      #
  $data    = File::HomeDir->my_data;        # 

=head1 DESCRIPTION

This module provides implementations for determining common user
directories.  In normal usage this module will always be
used via L<File::HomeDir>.

=head1 SUPPORT

See the support section the main L<File::HomeDir> module.

=head1 AUTHORS

Adam Kennedy E<lt>adamk@cpan.orgE<gt>

Sean M. Burke E<lt>sburke@cpan.orgE<gt>

=head1 SEE ALSO

L<File::HomeDir>, L<File::HomeDir::Win32> (legacy)

=head1 COPYRIGHT

Copyright 2005 - 2011 Adam Kennedy.

Copyright 2017 - 2020 Jens Rehsack

Some parts copyright 2000 Sean M. Burke.

This program is free software; you can redistribute
it and/or modify it under the same terms as Perl itself.

The full text of the license can be found in the
LICENSE file included with this module.

=cut
