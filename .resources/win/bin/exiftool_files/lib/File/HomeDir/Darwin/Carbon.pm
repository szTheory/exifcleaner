package File::HomeDir::Darwin::Carbon;

# Basic implementation for the Dawin family of operating systems.
# This includes (most prominently) Mac OS X.

use 5.008003;
use strict;
use warnings;
use Cwd                   ();
use Carp                  ();
use File::HomeDir::Darwin ();

use vars qw{$VERSION};

# This is only a child class of the pure Perl darwin
# class so that we can do homedir detection of all three
# drivers at one via ->isa.
use base "File::HomeDir::Darwin";

BEGIN
{
    $VERSION = '1.006';

    # Load early if in a forking environment and we have
    # prefork, or at run-time if not.
    local $@;                           ## no critic (Variables::RequireInitializationForLocalVars)
    eval "use prefork 'Mac::Files'";    ## no critic (ErrorHandling::RequireCheckingReturnValueOfEval)
}

#####################################################################
# Current User Methods

## no critic qw(UnusedPrivateSubroutines)
sub _guess_determined_home
{
    my $class = shift;

    require Mac::Files;
    my $home = $class->_find_folder(Mac::Files::kCurrentUserFolderType(),);
    $home ||= $class->SUPER::_guess_determined_home($@);
    return $home;
}

sub my_desktop
{
    my $class = shift;

    require Mac::Files;
    $class->_find_folder(Mac::Files::kDesktopFolderType(),);
}

sub my_documents
{
    my $class = shift;

    require Mac::Files;
    $class->_find_folder(Mac::Files::kDocumentsFolderType(),);
}

sub my_data
{
    my $class = shift;

    require Mac::Files;
    $class->_find_folder(Mac::Files::kApplicationSupportFolderType(),);
}

sub my_music
{
    my $class = shift;

    require Mac::Files;
    $class->_find_folder(Mac::Files::kMusicDocumentsFolderType(),);
}

sub my_pictures
{
    my $class = shift;

    require Mac::Files;
    $class->_find_folder(Mac::Files::kPictureDocumentsFolderType(),);
}

sub my_videos
{
    my $class = shift;

    require Mac::Files;
    $class->_find_folder(Mac::Files::kMovieDocumentsFolderType(),);
}

sub _find_folder
{
    my $class = shift;
    my $name  = shift;

    require Mac::Files;
    my $folder = Mac::Files::FindFolder(Mac::Files::kUserDomain(), $name,);
    return undef unless defined $folder;

    unless (-d $folder)
    {
        # Make sure that symlinks resolve to directories.
        return undef unless -l $folder;
        my $dir = readlink $folder or return;
        return undef unless -d $dir;
    }

    return Cwd::abs_path($folder);
}

#####################################################################
# Arbitrary User Methods

sub users_home
{
    my $class = shift;
    my $home  = $class->SUPER::users_home(@_);
    return defined $home ? Cwd::abs_path($home) : undef;
}

# in theory this can be done, but for now, let's cheat, since the
# rest is Hard
sub users_desktop
{
    my ($class, $name) = @_;
    return undef if $name eq 'root';
    $class->_to_user($class->my_desktop, $name);
}

sub users_documents
{
    my ($class, $name) = @_;
    return undef if $name eq 'root';
    $class->_to_user($class->my_documents, $name);
}

sub users_data
{
    my ($class, $name) = @_;
    $class->_to_user($class->my_data, $name)
      || $class->users_home($name);
}

# cheap hack ... not entirely reliable, perhaps, but ... c'est la vie, since
# there's really no other good way to do it at this time, that i know of -- pudge
sub _to_user
{
    my ($class, $path, $name) = @_;
    my $my_home    = $class->my_home;
    my $users_home = $class->users_home($name);
    defined $users_home or return undef;
    $path =~ s/^\Q$my_home/$users_home/;
    return $path;
}

1;

=pod

=head1 NAME

File::HomeDir::Darwin - Find your home and other directories on Darwin (OS X)

=head1 DESCRIPTION

This module provides Darwin-specific implementations for determining
common user directories.  In normal usage this module will always be
used via L<File::HomeDir>.

Note -- since this module requires Mac::Carbon and Mac::Carbon does
not work with 64-bit perls, on such systems, File::HomeDir will try
L<File::HomeDir::Darwin::Cocoa> and then fall back to the (pure Perl)
L<File::HomeDir::Darwin>.

=head1 SYNOPSIS

  use File::HomeDir;

  # Find directories for the current user
  $home    = File::HomeDir->my_home;      # /Users/mylogin
  $desktop = File::HomeDir->my_desktop;   # /Users/mylogin/Desktop
  $docs    = File::HomeDir->my_documents; # /Users/mylogin/Documents
  $music   = File::HomeDir->my_music;     # /Users/mylogin/Music
  $pics    = File::HomeDir->my_pictures;  # /Users/mylogin/Pictures
  $videos  = File::HomeDir->my_videos;    # /Users/mylogin/Movies
  $data    = File::HomeDir->my_data;      # /Users/mylogin/Library/Application Support

=head1 TODO

=over 4

=item * Test with Mac OS (versions 7, 8, 9)

=item * Some better way for users_* ?

=back

=head1 COPYRIGHT

Copyright 2009 - 2011 Adam Kennedy.

Copyright 2017 - 2020 Jens Rehsack

=cut
